import { errorResponse, rawResponse } from './api';
import { Store } from './store';
import { STORE_KEYS } from './constants';
import { refreshHospitalBeds } from "./refresh-hospital-beds";

/**
 * Refreshes all official data sources
 */
export async function refreshAllOfficialSources(request) {
    const isDebugMode = request.url.includes("debug");
    const onlyCaseCounts = request.url.includes("only=cases");
    const onlyHospitals = request.url.includes("only=hospitals");

    if (onlyCaseCounts) return await refreshCaseCounts(request, isDebugMode);
    else if (onlyHospitals) return await refreshHospitalBeds(request, isDebugMode);
    else {
        await refreshCaseCounts(request, isDebugMode);
        await refreshHospitalBeds(request, isDebugMode);
        return rawResponse({});
    }
}

/**
 * Fetches data from @SOURCE_URL and caches it
 */
async function refreshCaseCounts(request, isDebugMode) {
    const response = await fetch(SOURCE_URL);
    const content = (await response.text());
    if (response.status === 200) {
        const curOriginUpdateMillis = getOriginUpdateTime(content);
        const curOriginUpdateDate = new Date(curOriginUpdateMillis);
        const curRefreshedDate = new Date();
        const caseCounts = getCaseCounts(content);

        // heuristically check for failure
        if (!caseCounts || caseCounts.length === 0 || Object.keys(caseCounts[0]).length < 3) {
            return await errorResponse({code: 500, status: "Failed to parse HTML"})
        }

        // extract data from html content
        const notifications = getNotifications(content);
        const currentCaseCountRecord = createCaseCountRecord(caseCounts);

        // if we detect a new origin update, also update the historical timestamped record
        const historicalTimestamps = await getCaseCountHistoricalTimestamps();
        const isNewOriginUpdate = historicalTimestamps.length===0 ||
            curOriginUpdateMillis > new Date(historicalTimestamps[historicalTimestamps.length-1]).getTime();
        if (isNewOriginUpdate) {
            const ts = curOriginUpdateDate.toISOString();
            await Store.put(getCaseCountKeyForHistoricalTimestamp(ts), JSON.stringify(caseCounts));
        }

        // update all the usual cached keys if not in debug mode
        const currentUpdatePromise = Promise.all(isDebugMode ? [] : [
            // update case counts
            Store.put(STORE_KEYS.CACHED_CASE_COUNTS, JSON.stringify({
                success: true,
                data: currentCaseCountRecord,
                lastRefreshed: curRefreshedDate.toISOString(),
                lastOriginUpdate: curOriginUpdateDate.toISOString()
            })),
            // update notifications
            Store.put(STORE_KEYS.CACHED_NOTIFICATIONS, JSON.stringify({
                success: true,
                data: {notifications: notifications},
                lastRefreshed: curRefreshedDate.toISOString(),
                lastOriginUpdate: curOriginUpdateDate.toISOString()
            })),
            // update case count history
            Store.put(STORE_KEYS.CACHED_CASE_COUNTS_HISTORY, JSON.stringify({
                success: true,
                data: await getCaseCountTimeSeries(historicalTimestamps),
                lastRefreshed: curRefreshedDate.toISOString(),
                lastOriginUpdate: curOriginUpdateDate.toISOString()
            }))
        ]);

        await currentUpdatePromise;
        return rawResponse(isDebugMode ? caseCounts : {  });
    }
    else {
        const error = {code: response.status, status: response.statusText, body: content};
        return await errorResponse(error);
    }
}

/**
 * Get case count numbers from @content. The result is an array of objects, each specifying loc (location),
 * confirmedCasesIndian, confirmedCasesForeign, discharged and deaths
 */
function getCaseCounts(content) {
    const caseCounts = [];
    let locNameIdx = -1;
    let confirmedIndianIdx = -1;
    let confirmedForeignIdx = -1;
    let dischargedIdx = -1;
    let deadIdx = -1;
    let isTotalRow = false;
    forEveryTableRowCol(content, (row, col, data) => {
        if (row === 0) { // treat as header row
            const hdr = data.toLowerCase();
            if (hdr.includes("name")) locNameIdx = col;
            else if (hdr.includes("confirmed") && hdr.includes("indian")) confirmedIndianIdx = col;
            else if (hdr.includes("confirmed") && hdr.includes("foreign")) confirmedForeignIdx = col;
            else if (hdr.includes("discharged")) dischargedIdx = col;
            else if (hdr.includes("death")) deadIdx = col;
        }
        else {
            if (!isTotalRow) isTotalRow = col === 0 && data.toLowerCase().trim().startsWith("total");

            if (!isTotalRow) {
                if (col === 0) caseCounts.push({}); // initialize a new entry if it's a fresh row
                const locData = caseCounts[caseCounts.length-1]; // use the last entry

                if (col === locNameIdx) locData["loc"] = data;
                else if (col === confirmedIndianIdx) locData["confirmedCasesIndian"] = parseInt(data.trim());
                else if (col === confirmedForeignIdx) locData["confirmedCasesForeign"] = parseInt(data.trim());
                else if (col === dischargedIdx) locData["discharged"] = parseInt(data.trim());
                else if (col === deadIdx) locData["deaths"] = parseInt(data.trim());
            }
        }
    });
    return caseCounts;
}

/**
 * Iterates over all table rows in @content and invokes @cb with params as (row, col, cellData)
 */
function forEveryTableRowCol(content, cb) {
    const rowRegex = RegExp("<tr[^>]*>.+?</tr", "gs");
    let rowMatch;
    let rowCount = 0;
    while ((rowMatch = rowRegex.exec(content))) {
        let colCount = 0;
        const colRegex = RegExp("<t[dh][^>]*>(.+?)</t[dh]>", "gs");
        let colMatch;
        while ((colMatch = colRegex.exec(rowMatch[0]))) {
            const cellData = colMatch[0].replace(/<[^>]+>/gs, '');
            cb(rowCount, colCount, cellData);
            colCount++;
        }
        rowCount++;
    }
}

/**
 * Creates a record that includes summary stats, along with the regional data
 */
function createCaseCountRecord(regionalCaseCounts) {
    const summaryCounts = {
        "total": 0,
        "confirmedCasesIndian": 0,
        "confirmedCasesForeign": 0,
        "discharged": 0,
        "deaths": 0
    };

    for (let i=0; i<regionalCaseCounts.length; i++) {
        summaryCounts["confirmedCasesIndian"] += regionalCaseCounts[i]["confirmedCasesIndian"];
        summaryCounts["confirmedCasesForeign"] += regionalCaseCounts[i]["confirmedCasesForeign"];
        summaryCounts["discharged"] += regionalCaseCounts[i]["discharged"];
        summaryCounts["deaths"] += regionalCaseCounts[i]["deaths"];
    }
    summaryCounts["total"] = summaryCounts["confirmedCasesIndian"] + summaryCounts["confirmedCasesForeign"];

    return { "summary": summaryCounts, "regional": regionalCaseCounts };
}

/**
 * Get the origin update information as mentioned in @content
 * @returns {number} milliseconds since epoch
 */
function getOriginUpdateTime(content) {
    const r = RegExp("as on (\\d{2})\.(\\d{2})\.(\\d{4}) at (\\d{2}):(\\d{2})\\s*([AP]M)", "gi");
    let m;
    if ((m = r.exec(content))) {
        const day = parseInt(m[1]);
        const month = parseInt(m[2])-1;
        const year = parseInt(m[3]);
        const hour = parseInt(m[4]);
        const minute = parseInt(m[5]);
        const isPM = m[6].toLowerCase() === "pm";

        // use UTC to be consistent irrespective of TZ in which this is being executed
        let time = Date.UTC(year, month, day, hour, minute, 0, 0);
        time = time - 330*60*1000; // roll it back by 5:30hrs to capture it as IST
        if (isPM) time = time + 12*3600*1000; // add 12 hrs if it's PM

        return time;
    } else {
        return 0;
    }
}

/**
 * Parse notifications from html content
 */
function getNotifications(content) {
    const notifications = [];
    const listRegex = RegExp("<li>(.+?)</li>", "g");
    const hrefRegex = RegExp("<a .*href\\s*=\\s*\"([^\"]+).+");
    const tagRegex = RegExp("<[^>]+>", "g");
    let listMatch;
    while ((listMatch = listRegex.exec(content))) {
        const innerHTML = listMatch[1];
        const txt = innerHTML.replace(tagRegex, ' ').replace(/\s+/g, ' ').trim();
        let href;
        if ((href = innerHTML.match(hrefRegex))) {
            href = href[1];
            if (href.endsWith(".pdf") || href.includes(".gov.in")) {
                if (href.startsWith('/')) href = `${SOURCE_URL}${href}`;
                notifications.push({ title: txt, link: href });
            }
        }
    }
    return notifications;
}

/**
 * Get the sorted (oldest to latest) list of timestamps associated with historical case count records
 */
async function getCaseCountHistoricalTimestamps() {
    let cursor = undefined;
    const keys = [];
    while (true) {
        const keysResponse = await Store.list(getPrefixForHistoricalCaseCountKeys(), cursor);
        for (let i=0; i<keysResponse.keys.length; i++) {
            keys.push(getTimestampFromHistoricalCaseCountKey(keysResponse.keys[i].name));
        }
        if (keysResponse["list_complete"]) break;
        else cursor = keysResponse.cursor;
    }
    return keys.sort()
}

/**
 * Get an array of historical records - each entry representing the last record for that day
 */
async function getCaseCountTimeSeries(timestamps) {
    const day2Timestamp = {};

    // pick the last timestamp from each day
    for (let i=0; i<timestamps.length; i++) {
        const ts = timestamps[i];
        const day = getDayFromTimestamp(ts);
        const existingTimestamp = day2Timestamp[day];
        if (!existingTimestamp || existingTimestamp.localeCompare(ts) < 0) day2Timestamp[day] = ts;
    }

    const recordTimestamps = Object.values(day2Timestamp);
    const records = await Promise.all(
        recordTimestamps.map(getCaseCountKeyForHistoricalTimestamp).map(k => Store.get(k, "json"))
    );

    const timeseries = [];
    for (let i=0; i<recordTimestamps.length; i++) {
        const recordForDay = createCaseCountRecord(records[i]);
        timeseries.push({day: getDayFromTimestamp(recordTimestamps[i]), ...recordForDay});
    }
    return timeseries.sort((x,y) => x.day.localeCompare(y.day));
}

/**
 * Parses an ISO8601 date format to get YYYY-MM-DD part
 */
function getDayFromTimestamp(timestamp) {
    return timestamp.substr(0, 10);
}

/* Helper functions for historical record related key management */
function getCaseCountKeyForHistoricalTimestamp(timestamp) {
    return STORE_KEYS.CASE_COUNTS + "/" + timestamp;
}
function getTimestampFromHistoricalCaseCountKey(key) {
    return key.split('/')[1];
}
function getPrefixForHistoricalCaseCountKeys() {
    return STORE_KEYS.CASE_COUNTS + "/"
}

const SOURCE_URL = 'https://www.mohfw.gov.in';
<!--
  Title: COVID-19 API for India
  Description: APIs for India specific COVID-19 data
  Author: amodm
  -->

# api-covid-19-india

API for COVID-19 stats in India, sourced from [The Ministry of Health and Family Welfare](https://www.mohfw.gov.in/)
and separately from [unofficial sources](#unofficial-sources)

## API

#### Official data
* Stats: https://api.rootnet.in/covid19-in/stats/latest
* Stats as a daily series: https://api.rootnet.in/covid19-in/stats/daily
* Hospitals & bed stats: https://api.rootnet.in/covid19-in/stats/hospitals
* Contact & helpline: https://api.rootnet.in/covid19-in/contacts
* Notifications & advisories: https://api.rootnet.in/covid19-in/notifications

#### Unofficial data
* Unofficial sources: https://api.rootnet.in/covid19-in/unofficial/sources
* Unofficial patient tracing data: https://api.rootnet.in/covid19-in/unofficial/covid19india.org

#### Maintenance
* Refresh the data from source (maintainer only) https://api.rootnet.in/covid19-in/refresh

## Sources
* Post Mar 15, data is from [The Ministry of Health & Family Welfare](https://www.mohfw.gov.in/)
* Pre  Mar 15, data is sourced from [datameet/covid19](https://github.com/datameet/covid19/tree/eb1cc65657929abe12ca59f0e754bef4bc562d7a/mohfw-backup)
* Hospital & bed data: https://api.steinhq.com/v1/storages/5e732accb88d3d04ae0815ae/StateWiseHealthCapacity

## Unofficial sources
* The awesome volunteer driven patient tracing data [covid19india.org](https://www.covid19india.org/)

## For contributors

This is created using [Cloudflare Wrangler](https://github.com/cloudflare/wrangler), and hosted on Cloudflare

#### Credits
* Awesome team at [covid19india.org](https://www.covid19india.org/)
* Hospital data API from [@NirantK](https://github.com/NirantK)
* [@GalacticMaster](https://github.com/GalacticMaster) for reporting updated contact details

# Elucidat Web Scraper

This set of scripts can scrape Elucidat for the following data:
    * Project lists (https://app.elucidat.com/projects)
    * Learner Data (https://app.elucidat.com/analyse/619b84265446c#/your-data)




# Running it
(these instructions are not great, ask Chris Brodhecker for a quick demo)

Log in to Elucidat through your browser (these instructions assume Chrome browser)

### Update secrets.js file
Open the dev-tools and view the Network tab. Find a network call to Elucidat (ex. https://id.elucidat.com/permissions)

Copy the 'authorization' header and paste it into the authorization variable in secrets.js

[add a lot more here on how to do this]

Install the packages using `npm install` then run `npm run start`

// URL manzilini belgilang
const url = "https://www.mydevice.io/";  // O'zgartiring, haqiqiy URL

const fetch = require('node-fetch'); // This will bring in the fetch API

const { JSDOM } = require('jsdom'); // Import JSDOM from jsdom package
// URL of the resource
 // Replace with the actual URL

// Custom User-Agent
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Fetch request with custom headers
fetch(url, {
  method: 'GET',  // or 'POST', depending on your needs
  headers: {
    'User-Agent': userAgent,  // Custom User-Agent header
    'Accept': 'text/html',     // You can include other headers like 'Accept' for content types
    'Accept-Encoding': 'gzip, deflate, br',
    // Additional headers if required
  }
})
  .then(response => response.text())  // Get response as text
  .then(data => {
    // Use JSDOM to parse the HTML response
    const dom = new JSDOM(data);
    
    // Get the content of the <p> element with id="ua"
    const uaText = dom.window.document.querySelector('p#ua').textContent;
    
    // Output the result
    console.log("User-Agent:", uaText);
  })
  .catch(error => {
    console.error("Error fetching the data:", error);
  });

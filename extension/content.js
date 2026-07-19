// Content Script to scrape details on job platforms
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapeJobDetails') {
    const url = window.location.href;
    let title = '';
    let company = '';
    let location = '';
    let description = '';

    if (url.includes('linkedin.com/jobs')) {
      title = document.querySelector('.job-details-jobs-unified-top-card__job-title, h1, .jobs-unified-top-card__job-title')?.textContent?.trim() || '';
      company = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name')?.textContent?.trim() || '';
      location = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__bullet')?.textContent?.trim() || '';
      description = document.querySelector('#job-details, .jobs-description__content, .jobs-box__html-content')?.textContent?.trim() || '';
    } 
    
    else if (url.includes('indeed.com')) {
      title = document.querySelector('h1.jobsearch-JobInfoHeader-title')?.textContent?.trim() || '';
      company = document.querySelector('div[data-company-name="true"], .jobsearch-InlineCompanyRating div, .jobsearch-CompanyInfoContainer')?.textContent?.trim() || '';
      location = document.querySelector('#jobLocation, .jobsearch-JobInfoHeader-subtitle')?.textContent?.trim() || '';
      description = document.querySelector('#jobDescriptionText')?.textContent?.trim() || '';
    } 
    
    else if (url.includes('wuzzuf.net')) {
      title = document.querySelector('h1.css-55j7gg, h1.css-1u1775f')?.textContent?.trim() || '';
      company = document.querySelector('a.css-13ocg1s, .css-p838t2')?.textContent?.trim() || '';
      location = document.querySelector('.css-9x45w, .css-1tcr0k6')?.textContent?.trim() || '';
      description = document.querySelector('.css-14vba7f, section.css-3dlrh6')?.textContent?.trim() || '';
    }

    sendResponse({
      url,
      title,
      company,
      location,
      description: description.substring(0, 3000) // Truncate to save bandwidth
    });
    return true;
  }
});

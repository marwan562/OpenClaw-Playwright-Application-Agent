// Content Script: Extract Page context
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrapePageDetails') {
    const pageHtml = document.documentElement.outerHTML;
    const pageUrl = window.location.href;
    const selectedText = window.getSelection().toString();
    sendResponse({
      html: pageHtml,
      url: pageUrl,
      selection: selectedText
    });
  }
});

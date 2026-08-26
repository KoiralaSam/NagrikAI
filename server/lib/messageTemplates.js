function buildMessageDraft(serviceName) {
  return {
    nepali: `नमस्कार, मलाई ${serviceName} सम्बन्धी सहयोग चाहिएको छ। आवश्यक प्रक्रिया, कागजात, शुल्क र कार्यालयमा सम्पर्क गर्ने सही तरिका जानकारी गराइदिनुहुन अनुरोध गर्दछु।`,
    english: `Hello, I need help with ${serviceName}. Please share the required process, documents, fees, and the correct way to contact or visit the office.`,
  };
}

module.exports = { buildMessageDraft };

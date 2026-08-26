TRUNCATE guardrail_events, knowledge_notes, sources, contacts, service_aliases, services, agencies RESTART IDENTITY CASCADE;

INSERT INTO agencies (name, parent, address, last_verified_at, verification_status)
VALUES
  ('Department of Passports', 'Ministry of Foreign Affairs', 'Tripureshwor, Kathmandu, Nepal', '2026-08-26', 'verified'),
  ('Ministry of Foreign Affairs', 'Government of Nepal', 'Singhadurbar, Kathmandu, Nepal', '2026-08-26', 'verified'),
  ('Inland Revenue Department', 'Ministry of Finance', 'Lazimpat, Kathmandu, Nepal', '2026-08-26', 'verified'),
  ('District Administration Office', 'Ministry of Home Affairs', 'User district office, Nepal', NULL, 'routing_placeholder'),
  ('Department of Transport Management', 'Government of Nepal', 'Relevant transport management office, Nepal', NULL, 'routing_placeholder');

INSERT INTO services (agency_id, name, intent, summary_ne, summary_en)
VALUES
  (1, 'Passport help', 'passport_problem', 'राहदानी सम्बन्धी समस्या राहदानी विभाग वा जिल्ला/नियोग सेवा मार्फत हेरिन्छ।', 'Passport issues are handled by the Department of Passports, district offices, or Nepal missions abroad.'),
  (2, 'Consular and abroad help', 'consular_abroad_help', 'विदेशमा आपतकालीन वा कन्सुलर समस्या भए परराष्ट्र मन्त्रालय/सम्बन्धित नेपाली नियोगसँग सम्पर्क गर्नुहोस्।', 'For abroad or consular issues, contact the Ministry of Foreign Affairs or the relevant Nepal mission.'),
  (3, 'PAN and tax help', 'pan_tax_help', 'PAN वा कर सम्बन्धी विषय आन्तरिक राजस्व विभाग वा नजिकको आन्तरिक राजस्व कार्यालयले हेर्छ।', 'PAN and tax matters are handled by the Inland Revenue Department or the nearest revenue office.'),
  (4, 'Citizenship certificate help', 'citizenship_certificate_help', 'नागरिकता हराएको वा प्रतिलिपि चाहिएको विषय आफ्नो जिल्ला प्रशासन कार्यालयले हेर्छ।', 'Lost citizenship certificate or copy requests are handled by your District Administration Office.'),
  (5, 'Driving license help', 'driving_license_help', 'सवारी चालक अनुमतिपत्र नवीकरण वा समस्या यातायात व्यवस्था कार्यालयले हेर्छ।', 'Driving license renewal and related issues are handled by a transport management office.');

INSERT INTO service_aliases (service_id, alias)
VALUES
  (1, 'passport'), (1, 'राहदानी'), (1, 'पासपोर्ट'), (1, 'passport lost'), (1, 'Mero passport harayo'), (1, 'e-passport'),
  (2, 'consular'), (2, 'embassy'), (2, 'विदेश'), (2, 'abroad'), (2, 'foreign country'), (2, 'America passport lost'),
  (3, 'pan'), (3, 'tax'), (3, 'कर'), (3, 'PAN number'), (3, 'आन्तरिक राजस्व'),
  (4, 'citizenship'), (4, 'नागरिकता'), (4, 'nagarikta'), (4, 'citizenship certificate lost'), (4, 'मेरो नागरिकता हराएको छ'),
  (5, 'driving license'), (5, 'license renew'), (5, 'लाइसेन्स'), (5, 'सवारी चालक अनुमतिपत्र'), (5, 'renew license');

INSERT INTO contacts (agency_id, type, label, value, url)
VALUES
  (1, 'phone', 'Call enquiry', '+97715970330', NULL),
  (1, 'email', 'Email passport office', 'communication@nepalpassport.gov.np', NULL),
  (1, 'website', 'Open website', 'https://nepalpassport.gov.np/en', 'https://nepalpassport.gov.np/en'),
  (2, 'phone', 'Call MoFA', '+977-1-4200182', NULL),
  (2, 'email', 'Email MoFA', 'info@mofa.gov.np', NULL),
  (2, 'website', 'Open website', 'https://mofa.gov.np/contact-us/', 'https://mofa.gov.np/contact-us/'),
  (2, 'social', 'Facebook', 'https://www.facebook.com/MOFANEPAL/', 'https://www.facebook.com/MOFANEPAL/'),
  (3, 'phone', 'Call IRD', '01-5970081', NULL),
  (3, 'email', 'Email IRD', 'serviceird@ird.gov.np', NULL),
  (3, 'website', 'Open website', 'https://ird.gov.np/pages/get-in-touch/', 'https://ird.gov.np/pages/get-in-touch/'),
  (4, 'website', 'Find your DAO', 'https://moha.gov.np', 'https://moha.gov.np'),
  (5, 'website', 'Transport office', 'https://www.dotm.gov.np', 'https://www.dotm.gov.np');

INSERT INTO sources (agency_id, title, url, verified_at)
VALUES
  (1, 'Department of Passports contact page', 'https://nepalpassport.gov.np/en', '2026-08-26'),
  (2, 'Ministry of Foreign Affairs contact page', 'https://mofa.gov.np/contact-us/', '2026-08-26'),
  (3, 'Inland Revenue Department contact page', 'https://ird.gov.np/pages/get-in-touch/', '2026-08-26');

INSERT INTO knowledge_notes (service_id, title, body, source_url, verified_at)
VALUES
  (1, 'Lost passport warning', 'A passport reported as lost or stolen should not be used for travel even if later recovered.', 'https://nepalpassport.gov.np/en', '2026-08-26'),
  (1, 'Where to apply', 'Urgent passport service is available at the Department of Passports in Kathmandu; regular service is available from DAOs, AAOs and diplomatic missions abroad.', 'https://nepalpassport.gov.np/en', '2026-08-26'),
  (2, 'Emergency foreign affairs contact', 'MoFA publishes general inquiry numbers, email, and social channels for complaints and suggestions.', 'https://mofa.gov.np/contact-us/', '2026-08-26'),
  (3, 'IRD contact scope', 'IRD publishes central contact information and office-wise information officer contact numbers.', 'https://ird.gov.np/pages/get-in-touch/', '2026-08-26');

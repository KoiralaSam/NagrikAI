# Nepal government services catalog

Citizen-facing intents crawled from allowlisted official sites (`server/data/official-catalog.json`). Contacts stay in Postgres; process text lands in `knowledge-base/crawled/`.

## Identity & civil registration

| Intent | Agency |
|---|---|
| `citizenship_certificate_help` | District Administration Office (via MoHA) |
| `national_id_help` | Department of National ID and Civil Registration |
| `voter_id_help` | Election Commission Nepal |
| `passport_problem` | Department of Passports |
| `document_attestation_help` | Department of Consular Services |

## Tax, finance & banking

| Intent | Agency |
|---|---|
| `pan_tax_help` | Inland Revenue Department |
| `customs_help` | Department of Customs |
| `nrb_banking_help` | Nepal Rastra Bank |
| `epf_help` | Employees Provident Fund |
| `cit_help` | Citizen Investment Trust |

## Labour & social security

| Intent | Agency |
|---|---|
| `labor_office_help` | Ministry of Labour, Employment and Social Security |
| `foreign_employment_help` | Department of Foreign Employment |
| `social_security_help` | Social Security Fund |
| `loksewa_help` | Public Service Commission |

## Education

| Intent | Agency |
|---|---|
| `education_help` | Ministry of Education, Science and Technology |
| `see_exam_help` | National Examination Board |
| `scholarship_help` | Ministry of Education (scholarship notices) |
| `ctevi_help` | Council for Technical Education and Vocational Training |

## Health

| Intent | Agency |
|---|---|
| `public_health_help` | Ministry of Health and Population |
| `health_insurance_help` | Health Insurance Board |

## Transport & driving

| Intent | Agency |
|---|---|
| `driving_license_help` | Department of Transport Management |
| `vehicle_registration_help` | Department of Transport Management |

## Utilities & telecom

| Intent | Agency |
|---|---|
| `ntc_telecom_help` | Nepal Telecom (NTC) |
| `nea_electricity_help` | Nepal Electricity Authority |
| `telecom_complaint_help` | Nepal Telecommunications Authority |
| `postal_help` | Department of Postal Services |

## Land, local government & housing

| Intent | Agency |
|---|---|
| `land_registration_help` | Department of Land Management and Archive |
| `local_government_help` | Ministry of Federal Affairs and General Administration |
| `company_registration_help` | Office of the Company Registrar |

## Home affairs, police & immigration

| Intent | Agency |
|---|---|
| `police_report_help` | Nepal Police |
| `immigration_visa_help` | Department of Immigration |
| `consular_abroad_help` | Ministry of Foreign Affairs |

## Tourism & culture

| Intent | Agency |
|---|---|
| `tourism_permit_help` | Department of Tourism |

Refresh:

```bash
cd server
npm run crawl-knowledge
```

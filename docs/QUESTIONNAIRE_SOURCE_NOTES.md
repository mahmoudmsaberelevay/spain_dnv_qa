# Caribbean Questionnaire Source Notes

**Source:** `/home/ubuntu/upload/QUESTIONNAIRE.docx` (17 pages)

## Pages 1–5

The document begins with **Section I — Personal Information: Main Applicant**. It includes main applicant identity and physical details; current and permanent address/contact details; employment and business details; source of income, net income, net assets, net worth, acquisition of wealth, fixed assets, savings, investments, real estate, business assets, liabilities, long-term loans, and short-term liabilities; professional licenses and disciplinary history; spouse and previous-spouse details. It then starts **Section II — Main Applicant’s Family Information**, containing repeatable relative/dependent identity, residence, contact, passport, and physical-description fields.

## Pages 6–10

The family-information section continues through multiple dependent blocks. **Section III — Address Information** is a repeatable table for the applicant’s addresses during the past ten years, with From, To, and full address. **Section IV — Education Information** records Primary/Elementary, Secondary/High School, Bachelor, Master, and PhD entries with dates, school, location, and qualification. **Section V — Employment Information** is a repeatable table with date range, occupation, employer/company, complete address, and business type, including unemployment and self-employment. The form then asks for emergency-contact details and a detailed explanation of the reason for seeking alternative citizenship. Page 10 starts a spouse/dependants continuation form, repeating personal, contact, and employment fields.

## Implementation Implications

The client wizard must support four field modes: single-value questions, multiple-choice questions, long narrative answers, and repeatable row groups. Repeatable groups must present one row at a time with **Next question** and **Add another row** controls. The form must preserve draft answers and support continuation later before final submission.

## Pages 11–17

The spouse section repeats business, source-of-income, net-worth, assets, liabilities, professional licenses, disciplinary history, and previous-spouse fields. Spouse-family information collects father, mother, paternal grandparents, and repeatable brothers/sisters. Spouse/dependant address, education, and employment history are presented as repeatable tables.

The **Declarations** section contains 25 yes/no compliance and background questions. Questions cover criminal history, visa refusals/cancellations, bankruptcy/insolvency, investigations, security risk, detention/probation, pardons, sealed records, subpoenas, indictments, civil litigation, terrorism/criminal organizations, deportation/unlawful presence, unsuccessful citizenship applications, professional restrictions, politically exposed person status, mental incapacity, undisclosed business activities, law-enforcement/tax investigations, legitimate source of wealth, and tax compliance. Any disclosable answer requires a numbered narrative explanation; declarations 24 and 25 are confirmations rather than adverse-history questions.

The final page contains bilingual Arabic/English undertakings: disclose prior visa refusals; avoid incompatible visa applications; disclose all application information and adverse history; provide company and professional-license records; declare information true and notify ELEVAY of changes; and provide a client signature and date.

## Form Behavior Required by the Source

The wizard must support conditional follow-up text after Yes answers, acknowledgement checkboxes for undertakings, and an electronic signature/date step. The CRM review should preserve submitted values exactly, organize them by original section, identify incomplete/N/A values, and show repeatable entries as tables.

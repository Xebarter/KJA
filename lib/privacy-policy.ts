/* Text may use {email}, {phone} and {address}; the page swaps them for the school's live contact details. */
export type PolicyBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "terms"; items: [string, string][] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; icon: string; text: string };

export type PolicySection = { id: string; icon: string; title: string; summary?: string; blocks: PolicyBlock[] };

export const POLICY_UPDATED = "2026-10-13";

export const POLICY_HIGHLIGHTS = [
  { icon: "fa-hand-holding-heart", title: "We never sell your data", text: "Your information is used only to run the school and support your family." },
  { icon: "fa-child-reaching", title: "Children come first", text: "We only collect a child's details from, or with the consent of, a parent or guardian." },
  { icon: "fa-cookie-bite", title: "No tracking cookies", text: "We use no advertising or analytics cookies, only those needed to sign you in." },
  { icon: "fa-user-shield", title: "You stay in control", text: "Ask to see, correct or delete your information at any time." },
];

export const POLICY_SUMMARY = [
  { icon: "fa-folder-open", title: "What we collect", text: "Contact details you share in our forms, admission details about your child, and parent portal records.", href: "#information-we-collect" },
  { icon: "fa-bullseye", title: "Why we use it", text: "To answer enquiries, process admissions, arrange visits, keep parents informed and run the school safely.", href: "#how-we-use-it" },
  { icon: "fa-people-group", title: "Who sees it", text: "Authorised KJA staff, trusted service providers who host our systems, and authorities only where the law requires.", href: "#sharing" },
  { icon: "fa-sliders", title: "Your choices", text: "Access, correct or delete your data, withdraw consent, unsubscribe, or complain to the regulator.", href: "#your-rights" },
];

export const POLICY_RIGHTS = [
  { icon: "fa-circle-info", title: "Be informed", text: "Know what we collect, why, and who we share it with. This policy is part of that promise." },
  { icon: "fa-eye", title: "Access your data", text: "Ask for a copy of the personal information we hold about you or your child." },
  { icon: "fa-pen-to-square", title: "Correct it", text: "Ask us to fix information that is inaccurate, out of date or incomplete." },
  { icon: "fa-trash-can", title: "Have it deleted", text: "Ask us to erase information we no longer need or have no lawful reason to keep." },
  { icon: "fa-hand", title: "Object or restrict", text: "Ask us to stop or limit processing, including direct marketing such as our newsletter." },
  { icon: "fa-rotate-left", title: "Withdraw consent", text: "Where we rely on your consent, withdraw it at any time without affecting earlier use." },
];

export const POLICY_SECTIONS: PolicySection[] = [
  {
    id: "about-this-policy",
    icon: "fa-school",
    title: "About this policy",
    blocks: [
      { kind: "p", text: "Kampala Junior Academy (\"KJA\", \"the school\", \"we\", \"us\") is committed to protecting the privacy of the families, pupils, alumni, staff and visitors we serve. This policy explains how we collect, use, share and protect personal information when you use our website, our online forms and the KJA parent portal, or when you contact us." },
      { kind: "p", text: "Kampala Junior Academy is the data controller for this information. We handle personal data in line with the Data Protection and Privacy Act, 2019 of Uganda and the Data Protection and Privacy Regulations, 2021, and we apply the same care to the information of every child in our community." },
      { kind: "p", text: "Pupils who are enrolled at KJA also have school records (such as attendance, health and academic records) that are kept by the school. Those records are protected by the same principles described here, and parents may receive further information about them when their child joins the school." },
    ],
  },
  {
    id: "information-we-collect",
    icon: "fa-folder-open",
    title: "The information we collect",
    summary: "We only ask for what we need for the purpose you're contacting us about.",
    blocks: [
      { kind: "p", text: "Most of the information we hold is given to us directly by you. Depending on how you interact with us, this may include:" },
      {
        kind: "table",
        head: ["When you…", "We may collect"],
        rows: [
          ["Send us a message or enquiry", "Your name, email address, phone number, preferred campus, the topic and your message."],
          ["Book a campus visit", "Your name and contact details, the campus, preferred date and time of day, your child's age or class and any notes you add."],
          ["Apply for admission", "Parent or guardian name, email and phone number, your child's name, date of birth, the campus and class applied for, and any information you choose to share in your message."],
          ["Use the parent portal", "Your account details (name, email and password, or your Google sign-in), your children's names, campus, class, date of birth and student code, school reports, fee balances, club sign-ups, messages and notifications."],
          ["Subscribe to our newsletter", "Your email address."],
          ["Share your alumni story", "Your name, class year, email and phone number, and your answers about your time at KJA."],
          ["Apply for a job with us", "Your CV, cover letter, academic documents and certificates, references and contact details."],
          ["Visit our website", "Basic technical information such as your IP address, browser type and the pages you request, recorded automatically by our hosting providers for security and reliability."],
        ],
      },
      { kind: "note", icon: "fa-triangle-exclamation", text: "Please don't include sensitive information, such as medical details, in website forms unless we ask for it. If your child has health or support needs, our admissions team will discuss them with you directly and record them securely." },
    ],
  },
  {
    id: "childrens-information",
    icon: "fa-child-reaching",
    title: "Children's information",
    summary: "Parents and guardians stay in charge of their children's data.",
    blocks: [
      { kind: "p", text: "Our pupils are young children, so we take particular care with their information. We collect information about a child only from, or with the consent of, their parent or guardian, and only for purposes connected with their education, safety and wellbeing." },
      {
        kind: "list",
        items: [
          "Our website and parent portal are designed for parents, guardians and adults. Children should not submit forms or create accounts themselves.",
          "Information about a child is only visible to their linked parent or guardian in the portal, and to authorised school staff who need it to do their work.",
          "If we learn that a child has given us personal information without a parent's consent, we will delete it.",
        ],
      },
    ],
  },
  {
    id: "how-we-use-it",
    icon: "fa-bullseye",
    title: "How we use your information",
    blocks: [
      { kind: "p", text: "We use personal information only for clear and legitimate purposes, and only where the law allows us to. These include:" },
      {
        kind: "terms",
        items: [
          ["Responding to you", "Answering enquiries, arranging campus visits and following up on messages you send us."],
          ["Admissions", "Assessing applications, contacting you about assessments, interviews and offers, and preparing for your child's enrolment."],
          ["Running the parent portal", "Sharing reports, fee balances, notices, calendars and messages with you, and managing club sign-ups."],
          ["School communication", "Sending our newsletter and updates about events, but only if you have subscribed, and you can unsubscribe at any time."],
          ["Safety and security", "Protecting our pupils, staff, systems and website, preventing misuse and investigating problems."],
          ["Legal duties", "Meeting our obligations to education, tax and other authorities in Uganda, and keeping records the law requires."],
          ["Improving our services", "Understanding what families need from us, so we can improve our school, website and communication."],
        ],
      },
      { kind: "p", text: "We rely on your consent (for example, for our newsletter or publishing your alumni story), on the need to take steps you've asked for or to provide the education you've chosen for your child, on our legal obligations, and on our legitimate interests in running a safe and effective school. We do not make decisions about you or your child using fully automated processes." },
    ],
  },
  {
    id: "photos-and-publicity",
    icon: "fa-camera",
    title: "Photos, stories and publicity",
    blocks: [
      { kind: "p", text: "We love celebrating our pupils' achievements. Photos and videos taken at school events, classes and sports may appear on our website, social media pages, newsletters and printed materials." },
      {
        kind: "list",
        items: [
          "We avoid publishing a child's full name alongside their photo without their parent's permission.",
          "Alumni stories and profiles are only published with the consent of the person who shared them.",
          "If you'd prefer your child not to appear in our publicity, or you'd like an image removed, contact us at {email} and we'll act on your request promptly.",
        ],
      },
    ],
  },
  {
    id: "cookies",
    icon: "fa-cookie-bite",
    title: "Cookies and similar technologies",
    summary: "We keep cookies to the minimum needed for the site to work.",
    blocks: [
      { kind: "p", text: "Cookies are small files stored on your device. We do not use advertising or analytics cookies, and we don't track you across other websites." },
      {
        kind: "table",
        head: ["Type", "Why we use it", "How long"],
        rows: [
          ["Essential sign-in cookies", "Keep you securely signed in to the parent portal and staff areas, and protect your session.", "Until you sign out or the session expires"],
          ["Third-party content", "Some pages show content from other services, such as Google Maps for directions, YouTube for videos and Google Fonts for our typefaces. These providers may set their own cookies or record your IP address when the content loads.", "Set by each provider"],
        ],
      },
      { kind: "p", text: "You can block or delete cookies in your browser settings. If you block essential cookies, you won't be able to sign in to the parent portal." },
    ],
  },
  {
    id: "sharing",
    icon: "fa-people-group",
    title: "Who we share information with",
    summary: "We never sell or rent your personal information.",
    blocks: [
      { kind: "p", text: "Your information is seen only by authorised KJA staff who need it, such as our admissions, campus, finance and administration teams. We share it outside the school only when necessary:" },
      {
        kind: "terms",
        items: [
          ["Service providers", "Trusted companies that host our website, database and files, provide secure sign-in, and send email on our behalf. They may only use your information to provide their services to us."],
          ["Government and regulators", "Authorities such as the Ministry of Education and Sports, the Uganda National Examinations Board and tax authorities, where the law requires it."],
          ["Safeguarding and emergencies", "Health professionals, emergency services or the police where it's needed to protect a child's safety or wellbeing."],
          ["Professional advisers", "Auditors, lawyers and insurers, under a duty of confidentiality."],
        ],
      },
      { kind: "p", text: "If you sign in with Google, Google shares your name and email address with us under its own privacy policy. Links to other websites, including our social media pages, are covered by those websites' own privacy policies." },
    ],
  },
  {
    id: "international-transfers",
    icon: "fa-earth-africa",
    title: "Storing information outside Uganda",
    blocks: [
      { kind: "p", text: "Some of our service providers store data on secure servers outside Uganda. When this happens, we only use providers that apply strong security and data protection standards, and we take the steps required by Ugandan law to make sure your information receives a comparable level of protection." },
    ],
  },
  {
    id: "security",
    icon: "fa-lock",
    title: "How we protect your information",
    blocks: [
      { kind: "p", text: "We use technical and organisational measures to keep personal information safe from loss, misuse and unauthorised access, including:" },
      {
        kind: "list",
        items: [
          "Encrypted connections (HTTPS) for our website, forms and parent portal.",
          "Secure sign-in, with each parent able to see only their own family's records.",
          "Access restricted to staff who need it, protected by individual accounts.",
          "Trusted hosting providers with industry-standard security and backups.",
        ],
      },
      { kind: "p", text: "No system is completely secure, so please keep your portal password private and sign out on shared devices. If a data breach puts your information at risk, we will notify you and the Personal Data Protection Office as the law requires." },
    ],
  },
  {
    id: "retention",
    icon: "fa-clock-rotate-left",
    title: "How long we keep information",
    blocks: [
      { kind: "p", text: "We keep personal information only for as long as we need it for the purpose it was collected, or as long as the law requires. As a guide:" },
      {
        kind: "table",
        head: ["Information", "How long we keep it"],
        rows: [
          ["Enquiries and visit requests", "Up to 2 years after our last contact with you."],
          ["Applications that don't lead to enrolment", "Up to 1 year after the intake you applied for."],
          ["Pupil and parent records", "For as long as your child is at KJA, then for the period required by law and for school records."],
          ["Parent portal accounts", "While your child is enrolled. We close accounts within a year of a child leaving, unless you ask us to do so sooner."],
          ["Newsletter subscriptions", "Until you unsubscribe."],
          ["Job applications", "Up to 1 year after the role is filled, unless you join our team."],
        ],
      },
      { kind: "p", text: "When information is no longer needed, we delete it securely or anonymise it so it can no longer identify you." },
    ],
  },
  {
    id: "your-rights",
    icon: "fa-user-shield",
    title: "Your rights",
    summary: "The Data Protection and Privacy Act, 2019 gives you control over your information.",
    blocks: [
      { kind: "p", text: "You have the following rights over your personal information, and parents and guardians may exercise them on behalf of their children:" },
    ],
  },
  {
    id: "changes",
    icon: "fa-arrows-rotate",
    title: "Changes to this policy",
    blocks: [
      { kind: "p", text: "We may update this policy from time to time to reflect changes in the law, our services or how we use information. The date at the top of this page shows when it was last updated. Where changes are significant, we will let parents know through the parent portal or by email." },
    ],
  },
];

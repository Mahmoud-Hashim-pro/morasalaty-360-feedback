// =========================================================
// قائمة موظفي شركة مراسلاتي وسماء جروب (البيانات الفعلية المعتمدة)
// =========================================================

const EMPLOYEES = [
  {
    id: 1,
    name: "حازم خالد",
    email: "hazem.khaled@samaagroup.net",
    role: "مالك CRM",
    team: "TS",
    isManager: true,
    managerId: 8,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 2,
    name: "ابراهيم ناصر",
    email: "ibrahim.nasser@samaagroup.net",
    role: "مالك CRM",
    team: "TS",
    isManager: true,
    managerId: 8,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 3,
    name: "أحمد هاشم",
    email: "a.hashim@samaagroup.net",
    role: "مالك CRM",
    team: "TS",
    isManager: true,
    managerId: 8,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 4,
    name: "احمد طارق",
    email: "ahmed.tarek@samaagroup.net",
    role: "مالك CRM",
    team: "TS",
    isManager: true,
    managerId: 8,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 5,
    name: "بهاء الدين أيمن",
    email: "bahaa.ayman@samaagroup.net",
    role: "مالك CRM",
    team: "TS",
    isManager: true,
    managerId: 8,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 6,
    name: "زياد ماضي",
    email: "ziad.mady@samaagroup.net",
    role: "مالك CRM",
    team: "TS",
    isManager: true,
    managerId: 8,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 7,
    name: "عبد الرحمن خالد",
    email: "abdelrahman@samaagroup.net",
    role: "مالك CRM",
    team: "TS",
    isManager: true,
    managerId: 8,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 8,
    name: "محمود هاشم",
    email: "mahmoud.hashim@samaagroup.net",
    role: "مالك CRM (Admin)",
    team: "Admin",
    isManager: true,
    managerId: null, // رأس الهيكل الإداري / القيادة العامة
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 9,
    name: "احمد طه",
    email: "a.taha@samaagroup.net",
    role: "مدير CRM",
    team: "Sales",
    isManager: true,
    managerId: 8,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: false, whatsappSamaa: true }
  },
  {
    id: 10,
    name: "محمد رجب",
    email: "mohamed.ragab@samaagroup.net",
    role: "مشرف CRM",
    team: "Sales",
    isManager: true,
    managerId: 9,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: false, whatsappSamaa: true }
  },
  {
    id: 11,
    name: "ابراهيم حسن",
    email: "ibrahim.hassan@samaagroup.net",
    role: "وكيل CRM",
    team: "Admin",
    isManager: false,
    managerId: 8,
    channels: { instagram: false, otherEmail: false, twitter: false, samaaChat: false, morasalatyChat: false, messenger: false, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 12,
    name: "اسراء حامد",
    email: "esraa.hamed@samaagroup.net",
    role: "وكيل CRM",
    team: "Sales",
    isManager: false,
    managerId: 10,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: false, whatsappSamaa: true }
  },
  {
    id: 13,
    name: "سلمى عصام",
    email: "salma.essam@samaagroup.net",
    role: "وكيل CRM",
    team: "TS",
    isManager: false,
    managerId: 4,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 14,
    name: "فاطمة شبانة",
    email: "fatma.shabana@samaagroup.net",
    role: "وكيل CRM",
    team: "Admin",
    isManager: false,
    managerId: 8,
    channels: { instagram: false, otherEmail: false, twitter: false, samaaChat: false, morasalatyChat: false, messenger: false, whatsappMorasalaty: false, whatsappSamaa: true }
  },
  {
    id: 15,
    name: "محمد رفاعي",
    email: "mohamed.refaay@samaagroup.net",
    role: "وكيل CRM",
    team: "TS",
    isManager: false,
    managerId: 4,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  },
  {
    id: 16,
    name: "محمد عزت",
    email: "mohamed.ezzat@samaagroup.net",
    role: "وكيل CRM",
    team: "Sales",
    isManager: false,
    managerId: 10,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: false, whatsappSamaa: true }
  },
  {
    id: 17,
    name: "محمد فراج",
    email: "m.farrag@samaagroup.net",
    role: "وكيل CRM",
    team: "TS",
    isManager: false,
    managerId: 1,
    channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
  }
];

// كلمات مرور تجريبية سريعة
const DEMO_PASSWORDS = {
  "hazem.khaled@samaagroup.net":    "hazem123",
  "ibrahim.nasser@samaagroup.net":  "ibrahim123",
  "a.hashim@samaagroup.net":        "hashim123",
  "ahmed.tarek@samaagroup.net":     "ahmed123",
  "bahaa.ayman@samaagroup.net":     "bahaa123",
  "ziad.mady@samaagroup.net":       "ziad123",
  "abdelrahman@samaagroup.net":     "abdel123",
  "mahmoud.hashim@samaagroup.net":  "mahmoud123",
  "a.taha@samaagroup.net":          "taha123",
  "mohamed.ragab@samaagroup.net":   "ragab123",
  "ibrahim.hassan@samaagroup.net":  "hassan123",
  "esraa.hamed@samaagroup.net":     "esraa123",
  "salma.essam@samaagroup.net":     "salma123",
  "fatma.shabana@samaagroup.net":   "fatma123",
  "mohamed.refaay@samaagroup.net":  "refaay123",
  "mohamed.ezzat@samaagroup.net":   "ezzat123",
  "m.farrag@samaagroup.net":        "farrag123",
  // حساب HR الإداري
  "hr.admin@samaagroup.net":        "hradmin2024",
  "hr.admin@morasalaty.com":        "hradmin2024",
};

// دور الـ HR Admin
const HR_ADMIN = {
  id: 0,
  name: "مدير الموارد البشرية",
  email: "hr.admin@samaagroup.net",
  role: "HR Admin",
  team: "Admin",
  isHRAdmin: true
};

if (typeof module !== 'undefined') {
  module.exports = { EMPLOYEES, DEMO_PASSWORDS, HR_ADMIN };
}

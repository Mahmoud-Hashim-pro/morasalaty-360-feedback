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

// كلمة المرور الموحدة السهلة لجميع الموظفين
const UNIFORM_PASSWORD = "mora123";

// خريطة كلمات المرور المعتمدة لجميع الحسابات
const DEMO_PASSWORDS = {
  // صاحب المنصة والمدير العام (Super Admin / Owner)
  "mahmoud@tieapps.com":           "mora123",
  
  // الـ 17 موظفاً (كلمة مرور موحدة سهلة للإرسال: mora123)
  "hazem.khaled@samaagroup.net":    "mora123",
  "ibrahim.nasser@samaagroup.net":  "mora123",
  "a.hashim@samaagroup.net":        "mora123",
  "ahmed.tarek@samaagroup.net":     "mora123",
  "bahaa.ayman@samaagroup.net":     "mora123",
  "ziad.mady@samaagroup.net":       "mora123",
  "abdelrahman@samaagroup.net":     "mora123",
  "mahmoud.hashim@samaagroup.net":  "mora123",
  "a.taha@samaagroup.net":          "mora123",
  "mohamed.ragab@samaagroup.net":   "mora123",
  "ibrahim.hassan@samaagroup.net":  "mora123",
  "esraa.hamed@samaagroup.net":     "mora123",
  "salma.essam@samaagroup.net":     "mora123",
  "fatma.shabana@samaagroup.net":   "mora123",
  "mohamed.refaay@samaagroup.net":  "mora123",
  "mohamed.ezzat@samaagroup.net":   "mora123",
  "m.farrag@samaagroup.net":        "mora123",

  // حساب إدارة الموارد البشرية
  "hr.admin@samaagroup.net":        "mora123",
  "hr.admin@morasalaty.com":        "mora123"
};

// حساب صاحب المنصة والمدير العام
const SUPER_ADMIN = {
  id: 99,
  name: "محمود هاشم",
  email: "mahmoud@tieapps.com",
  role: "مالك المنصة والمدير العام (Platform Owner & Super Admin)",
  team: "Admin",
  isManager: true,
  managerId: null,
  isHRAdmin: true,
  isSuperAdmin: true,
  channels: { instagram: true, otherEmail: true, twitter: true, samaaChat: true, morasalatyChat: true, messenger: true, whatsappMorasalaty: true, whatsappSamaa: true }
};

// حساب HR Admin الإداري
const HR_ADMIN = {
  id: 0,
  name: "مدير الموارد البشرية",
  email: "hr.admin@samaagroup.net",
  role: "HR Admin",
  team: "Admin",
  isHRAdmin: true,
  isManager: true
};

if (typeof module !== 'undefined') {
  module.exports = { EMPLOYEES, DEMO_PASSWORDS, UNIFORM_PASSWORD, HR_ADMIN, SUPER_ADMIN };
}

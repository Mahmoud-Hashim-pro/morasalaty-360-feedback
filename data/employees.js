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

// ---------------------------------------------------------
// لا توجد أي كلمات مرور في هذا الملف.
// كلمات المرور تُنشأ عشوائياً من شاشة «المستخدمون والصلاحيات»
// أو عبر: npm run set-password -- user@email
// ---------------------------------------------------------

// الأدوار الافتراضية عند أول تشغيل (يمكن تعديلها لاحقاً من شاشة المستخدمين)
//   manager : مدير إدارة — يقيّم موظفي إدارته
//   hr      : الموارد البشرية — تقييم إداري لكل الموظفين
//   (الباقي employee)
const DEFAULT_ACCESS_ROLES = {
  "ahmed.tarek@samaagroup.net": "manager",     // الدعم الفني (TS)
  "mahmoud.hashim@samaagroup.net": "manager",  // الإدارة (Admin)
  "a.taha@samaagroup.net": "manager",          // المبيعات (Sales)
  "fatma.shabana@samaagroup.net": "hr"
};

// حسابات مدير النظام (لا تشارك في التقييم — ترى النتائج وتدير المستخدمين)
const ADMIN_ACCOUNTS = [
  { id: 99, name: "محمود هاشم (مدير النظام)", email: "mahmoud@tieapps.com", team: "Admin" },
  { id: 0, name: "حساب الموارد البشرية (النتائج)", email: "hr.admin@samaagroup.net", team: "Admin" }
];

if (typeof module !== 'undefined') {
  module.exports = { EMPLOYEES, DEFAULT_ACCESS_ROLES, ADMIN_ACCOUNTS };
}

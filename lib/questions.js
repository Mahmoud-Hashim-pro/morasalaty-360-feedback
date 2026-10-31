// =========================================================
// Morasalaty 360 — Question sets for the four evaluation menus
// Shared by the API (validation) and the browser (rendering).
// Peer criteria texts live in data/modules.js.
// =========================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../data/modules'));
  } else {
    root.M360Questions = factory({
      MODULES: root.MODULES,
      MANAGER_EVAL_QUESTIONS: root.MANAGER_EVAL_QUESTIONS,
      FATIMA_HR_QUESTIONS: root.FATIMA_HR_QUESTIONS,
      SELF_EVAL_QUESTIONS: root.SELF_EVAL_QUESTIONS
    });
  }
})(typeof self !== 'undefined' ? self : this, function (src) {
  'use strict';

  const SCALE = [
    { value: 1, label: 'ضعيف جداً' },
    { value: 2, label: 'يحتاج تحسين' },
    { value: 3, label: 'يلبي التوقعات' },
    { value: 4, label: 'يفوق التوقعات' },
    { value: 5, label: 'أداء متميز' }
  ];
  const NA_VALUE = 'N/A';
  const MAX_TEXT = 2000;

  const DEPARTMENT_LABELS = {
    TS: 'الدعم الفني',
    Sales: 'المبيعات',
    Admin: 'الإدارة'
  };

  function departmentLabel(code) {
    if (!code) return '—';
    return DEPARTMENT_LABELS[code] || code;
  }

  const SETS = {
    peer: {
      type: 'peer',
      label: 'تقييم الزملاء',
      menuLabel: 'تقييم الزملاء (360°)',
      icon: '👥',
      intro: 'قيّم زملاءك بموضوعية. تقييمك سري تماماً ولا يظهر لأي زميل، وبعد الإرسال يختفي الزميل من قائمتك.',
      questions: src.MODULES.map((m) => ({
        id: m.questions[0].id,
        criterion: 'm' + m.id,
        num: m.id,
        title: m.title,
        shortTitle: m.shortTitle,
        icon: m.icon,
        text: m.questions[0].text,
        hints: [m.criteria1, m.criteria2].filter(Boolean),
        allowNA: true
      })),
      texts: [
        { id: 'strength', label: 'أبرز نقاط القوة في أداء {name}', placeholder: 'مثال: سرعة الرد على التذاكر، دعم الزملاء وقت الضغط…', required: false },
        { id: 'improvement', label: 'فرصة تطوير مقترحة لـ {name}', placeholder: 'مثال: مزيد من التوثيق في النظام، متابعة تحديثات المنصة…', required: false }
      ]
    },
    manager: {
      type: 'manager',
      label: 'تقييم المدير',
      menuLabel: 'تقييم فريقي (المدير)',
      icon: '👔',
      intro: 'تقييم تشغيلي لموظفي إدارتك: SLA، التعامل مع الضغط، التوثيق، والعمل الجماعي.',
      questions: src.MANAGER_EVAL_QUESTIONS.map((q) => ({
        id: q.id,
        criterion: q.id,
        num: q.num,
        title: q.title,
        shortTitle: q.title,
        icon: q.icon,
        text: q.text,
        hints: [q.category].filter(Boolean),
        allowNA: true
      })),
      texts: [
        { id: 'notes', label: 'ملاحظات المدير حول أداء {name} (اختياري)', placeholder: 'ملاحظات تشغيلية، أمثلة من التذاكر، توصيات…', required: false }
      ]
    },
    hr: {
      type: 'hr',
      label: 'التقييم الإداري',
      menuLabel: 'التقييم الإداري (الموارد البشرية)',
      icon: '📋',
      intro: 'تقييم الاستقرار والمرونة والالتزام ببيئة العمل المؤسسية لكل الموظفين.',
      questions: src.FATIMA_HR_QUESTIONS.map((q) => ({
        id: q.id,
        criterion: q.id,
        num: q.num,
        title: q.title,
        shortTitle: q.title,
        icon: q.icon,
        text: q.text,
        hints: [q.category].filter(Boolean),
        allowNA: true
      })),
      texts: [
        { id: 'notes', label: 'ملاحظات وتوصيات الموارد البشرية حول {name} (اختياري)', placeholder: 'سلوك، انضباط، التزام، توصية إدارية…', required: false }
      ]
    },
    self: {
      type: 'self',
      label: 'قيّم نفسك',
      menuLabel: 'قيّم نفسك (التقييم الذاتي)',
      icon: '🌟',
      intro: 'قياس شعورك بالمسؤولية، وقدرتك على إدارة الضغط، واستعدادك للتطور المستمر. إجاباتك سرية.',
      questions: src.SELF_EVAL_QUESTIONS.map((q) => ({
        id: q.id,
        criterion: q.id,
        num: q.num,
        title: q.title,
        shortTitle: q.title,
        icon: q.icon,
        text: q.text,
        hints: [],
        allowNA: false
      })),
      texts: [
        {
          id: 'initiative',
          label: (src.SELF_EVAL_QUESTIONS[2] && src.SELF_EVAL_QUESTIONS[2].detailQuestion) ||
            'ما هي المبادرة أو الحل الاستباقي الذي قدمته هذا الشهر لتقليل تكرار مشاكل العملاء؟',
          placeholder: 'اكتب المبادرة أو الحل الذي قدمته…',
          required: true
        }
      ],
      survey: {
        id: 'nextOne',
        question: 'سؤال استطلاعي: هل جربت نكست ون سابقاً؟',
        options: [
          { value: 'yes', label: 'نعم، جربته' },
          { value: 'no', label: 'لا، لم أجربه بعد' }
        ],
        feedback: { id: 'nextOneFeedback', label: 'ما انطباعك عن تجربتك مع نكست ون؟ (اختياري)' }
      }
    }
  };

  function getSet(type) {
    return SETS[type] || null;
  }

  function personalize(text, name) {
    return String(text || '').split('{name}').join(name || 'الموظف');
  }

  function isValidScore(v, allowNA) {
    if (allowNA && v === NA_VALUE) return true;
    return Number.isInteger(v) && v >= 1 && v <= 5;
  }

  /**
   * Validate and clean a payload { answers, texts, extra } for a question set.
   * Unknown keys are dropped. With { forSubmit: true } every question must be answered.
   */
  function validatePayload(type, payload, opts) {
    const set = getSet(type);
    const forSubmit = !!(opts && opts.forSubmit);
    const errors = [];
    if (!set) return { ok: false, errors: ['نوع تقييم غير معروف'], clean: null };

    const p = payload || {};
    const answersIn = (p.answers && typeof p.answers === 'object') ? p.answers : {};
    const textsIn = (p.texts && typeof p.texts === 'object') ? p.texts : {};
    const extraIn = (p.extra && typeof p.extra === 'object') ? p.extra : {};

    const answers = {};
    set.questions.forEach((q) => {
      let v = answersIn[q.id];
      if (v === undefined || v === null || v === '') {
        if (forSubmit) errors.push(`السؤال «${q.shortTitle}» بدون إجابة`);
        return;
      }
      if (typeof v === 'string' && v !== NA_VALUE && /^[1-5]$/.test(v)) v = Number(v);
      if (!isValidScore(v, q.allowNA)) {
        errors.push(`قيمة غير صالحة للسؤال «${q.shortTitle}»`);
        return;
      }
      answers[q.id] = v;
    });

    const texts = {};
    set.texts.forEach((t) => {
      const raw = textsIn[t.id];
      const v = typeof raw === 'string' ? raw.trim().slice(0, MAX_TEXT) : '';
      if (v) texts[t.id] = v;
      if (forSubmit && t.required && !v) errors.push('يرجى كتابة إجابة السؤال المفتوح قبل الإرسال');
    });

    const extra = {};
    if (set.survey) {
      const nt = extraIn[set.survey.id];
      if (nt === 'yes' || nt === 'no') extra[set.survey.id] = nt;
      const fb = extraIn[set.survey.feedback.id];
      if (typeof fb === 'string' && fb.trim()) extra[set.survey.feedback.id] = fb.trim().slice(0, MAX_TEXT);
    }

    return { ok: errors.length === 0, errors, clean: { answers, texts, extra } };
  }

  /** Percentage of scale questions answered (0-100). */
  function progressOf(type, answers) {
    const set = getSet(type);
    if (!set || !set.questions.length) return 0;
    const done = set.questions.filter((q) => answers && answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== '').length;
    return Math.round((done / set.questions.length) * 100);
  }

  function scoreBand(score) {
    if (score === null || score === undefined || isNaN(score)) return { key: 'none', label: 'لا توجد بيانات' };
    if (score >= 4.5) return { key: 'excellent', label: 'أداء متميز' };
    if (score >= 3.5) return { key: 'exceeds', label: 'يفوق التوقعات' };
    if (score >= 2.5) return { key: 'meets', label: 'يلبي التوقعات' };
    if (score >= 1.5) return { key: 'improve', label: 'يحتاج تحسين' };
    return { key: 'weak', label: 'ضعيف' };
  }

  return {
    SCALE,
    NA_VALUE,
    MAX_TEXT,
    SETS,
    DEPARTMENT_LABELS,
    departmentLabel,
    getSet,
    personalize,
    validatePayload,
    progressOf,
    scoreBand
  };
});

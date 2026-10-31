// =========================================================
// Morasalaty 360 — Permissions module (single source of truth)
// ---------------------------------------------------------
// Every permission decision in the API goes through this file.
// The browser loads the same file only to decide what to *show*;
// the server re-checks everything with these same functions.
//
// Roles
//   employee : evaluates all colleagues (peer) + rates himself (self)
//   manager  : employee rights + evaluates the employees of his own department
//   hr       : employee rights + administrative evaluation of everyone
//   admin    : system administrator — results, users and cycles only.
//              Admins are NOT participants: they neither evaluate nor get evaluated.
//
// Confidentiality rules
//   - Nobody can read a submitted evaluation, including the person who wrote it.
//   - Only `results.view` (admin) can read results, and only as aggregates
//     (peer evaluations never expose who wrote them).
// =========================================================
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.M360Permissions = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CAPABILITIES = {
    'peer.evaluate':    'تقييم الزملاء (360°)',
    'manager.evaluate': 'تقييم موظفي إدارته',
    'hr.evaluate':      'التقييم الإداري لكل الموظفين',
    'self.evaluate':    'التقييم الذاتي (قيّم نفسك)',
    'results.view':     'الاطلاع على النتائج والتحليلات',
    'users.manage':     'إدارة المستخدمين والصلاحيات',
    'cycles.manage':    'إدارة دورات التقييم'
  };

  const ROLES = {
    employee: {
      label: 'موظف',
      description: 'يقيّم كل زملائه ويقيّم نفسه. لا يرى أي نتائج.',
      capabilities: ['peer.evaluate', 'self.evaluate']
    },
    manager: {
      label: 'مدير إدارة',
      description: 'مثل الموظف، ويقيّم أيضاً موظفي إدارته (غير المديرين). لا يرى أي نتائج.',
      capabilities: ['peer.evaluate', 'self.evaluate', 'manager.evaluate']
    },
    hr: {
      label: 'الموارد البشرية',
      description: 'مثل الموظف، ويقيّم كل الموظفين تقييماً إدارياً. لا يرى أي نتائج.',
      capabilities: ['peer.evaluate', 'self.evaluate', 'hr.evaluate']
    },
    admin: {
      label: 'مدير النظام',
      description: 'يرى النتائج والتحليلات ويدير المستخدمين والدورات. لا يقيّم ولا يُقيَّم.',
      capabilities: ['results.view', 'users.manage', 'cycles.manage']
    }
  };

  const ROLE_ORDER = ['employee', 'manager', 'hr', 'admin'];
  const PARTICIPANT_ROLES = ['employee', 'manager', 'hr'];

  // Evaluation types, in the order the menus are shown. Self is always last.
  const EVAL_TYPES = ['peer', 'manager', 'hr', 'self'];
  const TYPE_CAPABILITY = {
    peer: 'peer.evaluate',
    manager: 'manager.evaluate',
    hr: 'hr.evaluate',
    self: 'self.evaluate'
  };

  function isValidRole(role) {
    return Object.prototype.hasOwnProperty.call(ROLES, role);
  }

  function isActive(user) {
    return !!user && user.isActive !== false;
  }

  function can(user, capability) {
    if (!isActive(user) || !isValidRole(user.accessRole)) return false;
    return ROLES[user.accessRole].capabilities.indexOf(capability) !== -1;
  }

  function isParticipant(user) {
    return isActive(user) && PARTICIPANT_ROLES.indexOf(user.accessRole) !== -1;
  }

  function sameId(a, b) {
    return Number(a) === Number(b);
  }

  function sameDepartment(a, b) {
    const da = String(a.department || '').trim().toLowerCase();
    const db = String(b.department || '').trim().toLowerCase();
    return da !== '' && da === db;
  }

  /**
   * Can `evaluator` fill an evaluation of `type` about `target`?
   * Returns { allowed: boolean, reason: string }.
   */
  function canEvaluate(evaluator, target, type) {
    const deny = (reason) => ({ allowed: false, reason });
    if (EVAL_TYPES.indexOf(type) === -1) return deny('نوع تقييم غير معروف');
    if (!isParticipant(evaluator)) return deny('هذا الحساب لا يشارك في التقييم');
    if (!can(evaluator, TYPE_CAPABILITY[type])) return deny('لا تملك صلاحية هذا النوع من التقييم');
    if (!isParticipant(target)) return deny('الموظف المطلوب غير مشارك في التقييم');

    const self = sameId(evaluator.id, target.id);
    switch (type) {
      case 'self':
        return self ? { allowed: true, reason: '' } : deny('التقييم الذاتي يكون لنفسك فقط');
      case 'peer':
        return self ? deny('لا يمكنك تقييم نفسك في تقييم الزملاء') : { allowed: true, reason: '' };
      case 'manager':
        if (self) return deny('لا يمكن للمدير تقييم نفسه');
        if (!sameDepartment(evaluator, target)) return deny('المدير يقيّم موظفي إدارته فقط');
        if (target.accessRole === 'manager') return deny('المدير لا يقيّم مديراً آخر');
        return { allowed: true, reason: '' };
      case 'hr':
        return self ? deny('لا يمكنك تقييم نفسك إدارياً') : { allowed: true, reason: '' };
      default:
        return deny('نوع تقييم غير معروف');
    }
  }

  /** All users that `evaluator` must evaluate with `type`. */
  function targetsFor(evaluator, users, type) {
    return (users || []).filter((u) => canEvaluate(evaluator, u, type).allowed);
  }

  /** Evaluation menus available to a user, in display order (self is last). */
  function menusFor(user) {
    return EVAL_TYPES.filter((t) => can(user, TYPE_CAPABILITY[t]));
  }

  /** Who is expected to evaluate `target` with `type` (used for participation tracking). */
  function evaluatorsOf(target, users, type) {
    return (users || []).filter((u) => canEvaluate(u, target, type).allowed);
  }

  /**
   * Organisation health checks shown to the admin so the setup is clear.
   * Returns a list of { level: 'warning'|'info', message }.
   */
  function auditOrganisation(users) {
    const issues = [];
    const active = (users || []).filter(isActive);
    const participants = active.filter(isParticipant);
    const departments = {};
    participants.forEach((u) => {
      const d = String(u.department || '').trim();
      if (!d) {
        issues.push({ level: 'warning', message: `المستخدم «${u.name}» بدون إدارة` });
        return;
      }
      departments[d] = departments[d] || { managers: [], members: 0 };
      departments[d].members++;
      if (u.accessRole === 'manager') departments[d].managers.push(u.name);
    });
    Object.keys(departments).forEach((d) => {
      const info = departments[d];
      if (info.managers.length === 0) {
        issues.push({ level: 'warning', message: `إدارة «${d}» ليس لها مدير — لن يحصل موظفوها على تقييم مدير` });
      } else if (info.managers.length > 1) {
        issues.push({ level: 'info', message: `إدارة «${d}» لها ${info.managers.length} مديرين (${info.managers.join('، ')}) — كل منهم سيقيّم موظفي الإدارة` });
      }
    });
    if (!participants.some((u) => u.accessRole === 'hr')) {
      issues.push({ level: 'warning', message: 'لا يوجد مستخدم بدور «الموارد البشرية» — لن يتم التقييم الإداري' });
    }
    if (!active.some((u) => u.accessRole === 'admin')) {
      issues.push({ level: 'warning', message: 'لا يوجد مدير نظام نشط' });
    }
    return issues;
  }

  return {
    CAPABILITIES,
    ROLES,
    ROLE_ORDER,
    PARTICIPANT_ROLES,
    EVAL_TYPES,
    TYPE_CAPABILITY,
    isValidRole,
    isActive,
    can,
    isParticipant,
    canEvaluate,
    targetsFor,
    menusFor,
    evaluatorsOf,
    auditOrganisation
  };
});

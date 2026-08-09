(function () {
  'use strict';

  /* الصفحة تُفتح على الهاتف قبل كل شيء. بلا هذا الوسم يفترض المتصفح عرضًا
     يقارب 1000 بكسل ثم يصغّر الصفحة كلها - فتصير الأرقام غير مقروءة على من
     أُرسلت إليه أصلًا. تُحقن هنا لأن الصفحة تُنشر بلا وصولٍ إلى الترويسة. */
  if (!document.querySelector('meta[name="viewport"]')) {
    var vp = document.createElement('meta');
    vp.setAttribute('name', 'viewport');
    vp.setAttribute('content', 'width=device-width, initial-scale=1');
    document.head.appendChild(vp);
  }

  /* ═══════════ محرّك التسعير ═══════════
     مرآةٌ حرفية لـ domain/pricing.ts: كل المبالغ بالأغورة كأعداد صحيحة،
     والأمتار بالألف من المتر، وكل قسمة صحيحةٌ بتقريب النصف بعيدًا عن الصفر
     - كما في PostgreSQL. لا قسمة عشرية تمسّ رقمًا ماليًا. */

  function divRoundHalfAway(numer, denom) {
    var sign = numer < 0 ? -1 : 1;
    var n = Math.abs(numer);
    var q = Math.floor(n / denom);
    var r = n - q * denom;
    return sign * (r * 2 >= denom ? q + 1 : q);
  }
  /** قاعدة المالك: الكسر يُسقَط لا يُقرَّب - فلا يدفع الزبون فوق الحسبة. */
  function floorToShekel(agorot) { return Math.floor(agorot / 100) * 100; }
  function rmTh(widthCm, quantity) {
    return divRoundHalfAway(Math.round(widthCm * 100) * quantity, 10);
  }

  var S = {
    trackCost: 1000, deliveryCost: 1000, installCost: 1500,
    motorTrackCost: 10000, motorTrackPrice: 20000,
    motorCost: 40000, motorPrice: 90000,
    remoteCost: 10000, remotePrice: 20000,
    vatPercent: 18, minMarginPercent: 35
  };

  var RULES = {
    standard: {
      crepe_with_lining:    [29000, 4000],
      crepe_without_lining: [27000, 4000],
      other_with_lining:    [35000, 4000],
      other_without_lining: [29000, 4000]
    },
    tall: {
      crepe_with_lining:    [45000, 7000],
      crepe_without_lining: [43000, 7000],
      other_with_lining:    [51000, 7000],
      other_without_lining: [45000, 7000]
    }
  };

  var FABRICS = [
    { id: 'crg-ow', name: 'كريب جورجيت', color: 'أوف وايت', kind: 'crepe', cost: 1400, hex: '#F2EDE4' },
    { id: 'crg-w',  name: 'كريب جورجيت', color: 'أبيض',     kind: 'crepe', cost: 1400, hex: '#FFFFFF' },
    { id: 'bsh-ow', name: 'بشتان',       color: 'أوف وايت', kind: 'other', cost: 2000, hex: '#F2EDE4' },
    { id: 'bsh-w',  name: 'بشتان',       color: 'أبيض',     kind: 'other', cost: 2000, hex: '#FFFFFF' },
    { id: 'bsh-b',  name: 'بشتان',       color: 'بيج',      kind: 'other', cost: 2000, hex: '#D8C3A5' }
  ];

  var LININGS = [
    { id: 'none', label: 'بدون',      note: '',              cost: 0,    perRm: 0,   surcharge: 0 },
    { id: 'l70',  label: '70%',  note: '3 م لكل متر',   cost: 900,  perRm: 3,   surcharge: 0 },
    { id: 'l100', label: '100%', note: '1.5 م لكل متر', cost: 3000, perRm: 1.5, surcharge: 17000 }
  ];

  var TRACKS = [
    { id: 'standard',  label: 'عادي',    note: 'ضمن سعر القماش' },
    { id: 'motorized', label: 'كهربائي', note: '+200 للمتر' }
  ];

  function price(o) {
    var fabric = o.fabric, lining = o.lining, motor = o.track === 'motorized';
    var hasLining = lining.id !== 'none';
    var band = o.heightCm >= 330 ? 'tall' : 'standard';
    var overMax = o.heightCm > 500;
    var cat = (fabric.kind === 'crepe' ? 'crepe' : 'other') + (hasLining ? '_with_lining' : '_without_lining');
    var rule = RULES[band][cat];

    var units = Math.max(1, o.quantity);
    var trackCost  = motor ? S.motorTrackCost  : S.trackCost;
    var trackPrice = motor ? S.motorTrackPrice : 0;
    var perWinPrice = motor ? (S.motorPrice + S.remotePrice) * units : 0;
    var perWinCost  = motor ? (S.motorCost  + S.remoteCost)  * units : 0;

    var surcharge = hasLining ? lining.surcharge : 0;
    var unitPrice = rule[0] + surcharge + trackPrice;

    var rt = rmTh(o.widthCm, units);
    var fullTh = Math.round(o.fullness * 1000);
    var liningPerRm = hasLining && lining.perRm > 0 ? lining.perRm : o.fullness;
    var liningMulTh = Math.round(liningPerRm * 1000);

    var fabricTh = divRoundHalfAway(rt * fullTh, 1000);
    var liningTh = hasLining ? divRoundHalfAway(rt * liningMulTh, 1000) : 0;

    var metersTotal = floorToShekel(divRoundHalfAway(unitPrice * rt, 1000));
    var lineTotal = metersTotal + perWinPrice;

    var perRmMilli =
      fabric.cost * fullTh +
      (hasLining ? lining.cost * liningMulTh : 0) +
      (rule[1] + trackCost + S.deliveryCost + S.installCost) * 1000;
    var metersCost = floorToShekel(divRoundHalfAway(perRmMilli * rt, 1000000));
    var internalCost = metersCost + perWinCost;

    if (overMax) { lineTotal = 0; metersTotal = 0; perWinPrice = 0; unitPrice = 0; }

    /**
     * البنود بمبالغها الكاملة على الشباك كله.
     *
     * المحرك يجمع معدّلات المتر أولًا ثم ينزّل الكسر مرةً واحدة على
     * المجموع؛ فلو نُزِّل كل بند وحده لاختلّ المجموع. لذلك تُحسب البنود
     * هنا بأغوروتها كاملة، ويُفرَد الفرق سطرًا باسمه في آخر العمود -
     * فيجمع العمود إلى الرقم نفسه الذي يعرضه التطبيق.
     */
    function whole(milliPerRm) { return divRoundHalfAway(milliPerRm * rt, 1000000); }
    var perM = ' × ' + (rt / 1000) + ' م';
    var items = [
      { label: fabric.name, work: (fabric.cost / 100) + ' × ' + o.fullness + perM,
        amount: whole(fabric.cost * fullTh) }
    ];
    if (hasLining) {
      items.push({
        label: 'البطانة ' + lining.label,
        work: (lining.cost / 100) + ' × ' + liningPerRm + perM,
        amount: whole(lining.cost * liningMulTh)
      });
    }
    items.push({ label: 'الخياط', work: (rule[1] / 100) + perM, amount: whole(rule[1] * 1000) });
    items.push({ label: motor ? 'مسار كهربائي' : 'مسار عادي',
      work: (trackCost / 100) + perM, amount: whole(trackCost * 1000) });
    items.push({ label: 'التوصيل', work: (S.deliveryCost / 100) + perM,
      amount: whole(S.deliveryCost * 1000) });
    items.push({ label: 'القياس والتركيب', work: (S.installCost / 100) + perM,
      amount: whole(S.installCost * 1000) });
    if (motor) {
      items.push({ label: 'ماتور', work: (S.motorCost / 100) + ' × ' + units + ' ستارة',
        amount: S.motorCost * units });
      items.push({ label: 'جهاز تحكم', work: (S.remoteCost / 100) + ' × ' + units + ' ستارة',
        amount: S.remoteCost * units });
    }
    var itemsSum = items.reduce(function (a, i) { return a + i.amount; }, 0);

    return {
      costItems: items, costRounding: internalCost - itemsSum,
      band: band, overMax: overMax, units: units,
      runningMeters: rt / 1000, fabricMeters: fabricTh / 1000, liningMeters: liningTh / 1000,
      hasLining: hasLining, motor: motor, liningPerRm: liningPerRm,
      basePrice: overMax ? 0 : rule[0], surcharge: overMax ? 0 : surcharge,
      trackPrice: overMax ? 0 : trackPrice, unitPrice: unitPrice,
      metersTotal: metersTotal, perWinPrice: perWinPrice, lineTotal: lineTotal,
      tailorCost: rule[1], trackCost: trackCost,
      fabricPerRm: divRoundHalfAway(fabric.cost * fullTh, 1000),
      liningPerRmCost: hasLining ? divRoundHalfAway(lining.cost * liningMulTh, 1000) : 0,
      perRmCost: perRmMilli / 1000,
      metersCost: metersCost, perWinCost: perWinCost, internalCost: internalCost
    };
  }

  /**
   * التجميع: الأسعار قبل מע"מ، والضريبة تُضاف على المجموع لا تُستخرَج منه.
   * والنِّسَب تُسقط كسرها إسقاطًا واحدًا، كما في المحرك و SQL حرفًا.
   */
  function totals(subtotal, cost, discountPercent) {
    var pct = Math.round(discountPercent * 100);
    var vatPct = Math.round(S.vatPercent * 100);
    var drop = function (amount, hundredths) {
      return Math.floor((amount * hundredths) / 1000000) * 100;
    };
    var discount = drop(subtotal, pct);
    var revenue = subtotal - discount;
    var vat = drop(revenue, vatPct);
    return {
      discount: discount, revenue: revenue, vat: vat, net: revenue + vat,
      profit: revenue - cost,
      marginPercent: revenue > 0
        ? divRoundHalfAway((revenue - cost) * 10000, revenue) / 100
        : 0
    };
  }

  /* ═══════════ العرض ═══════════ */

  /** الأرقام لاتينية كما هي في التطبيق - ليقارن الرقم بالرقم بلا ترجمة. */
  function num(v) { return String(v); }
  function money(agorot) {
    return '₪' + (agorot / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  /**
   * في ورقة التفصيل تُعرض الأغوروت حين توجد.
   *
   * البنود مفردةً تُنتج كسورًا (14 × 3 × 3.2 م = 134.40)، والمحرك ينزّل
   * الكسر مرةً واحدة على المجموع لا على كل بند. لو عُرض كل بند مقرَّبًا
   * لظهر عمودٌ لا يساوي مجموعه - وهو أسوأ ما يقع فيه من يدقّق.
   */
  function money2(agorot) {
    var neg = agorot < 0, a = Math.abs(agorot);
    return (neg ? '−' : '') + '₪' + (a / 100).toLocaleString('en-US', {
      minimumFractionDigits: a % 100 ? 2 : 0, maximumFractionDigits: 2
    });
  }
  function sh(agorot) { return String(Math.round(agorot / 100)); }
  function m(v) { return String(Math.round(v * 1000) / 1000); }

  /**
  * كل متر طولي يستهلك ثلاثة أمتار قماش - قاعدة المحل لا خيار الشباك،
  * فلا تُعرض سؤالًا. البطانة وحدها لها نسبتها الخاصة بدرجتها.
  */
  var FULLNESS = 3;

  /**
   * أيُّ الرقمين يُعرض كبيرًا: المجموع لא כולל מע"מ أم المطلوب כולל מע"מ.
   *
   * الافتراضي بلا ضريبة: هو الرقم الذي يُبنى عليه كل شيء في هذه الورقة -
   * التكلفة والربح والهامش تُقاس عليه، والضريبة تمرّ إلى الدولة. والاثنان
   * في ورقة النتيجة على كل حال، فالمفتاح إبرازٌ لا إخفاء.
   */
  var inclVat = false;

  var state = {
    widthCm: 100, heightCm: 280, quantity: 1,
    kind: 'crepe', fabric: FABRICS[0], lining: LININGS[1], track: 'standard',
    fullness: FULLNESS, discount: 0
  };

  function chipRow(host, items, isOn, onPick) {
    host.textContent = '';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', isOn(it) ? 'true' : 'false');
      if (it.hex) {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('class', 'sw');
        svg.setAttribute('viewBox', '0 0 10 10');
        svg.setAttribute('aria-hidden', 'true');
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', '5');
        c.setAttribute('cy', '5');
        c.setAttribute('r', '5');
        c.setAttribute('fill', it.hex);
        svg.appendChild(c);
        b.appendChild(svg);
      }
      var t = document.createElement('span');
      t.textContent = it.label;
      b.appendChild(t);
      if (it.note) {
        var n = document.createElement('small');
        n.textContent = it.note;
        b.appendChild(n);
      }
      b.addEventListener('click', function () { onPick(it); render(); });
      host.appendChild(b);
    });
  }

  /**
   * وضع مبلغ في عنصر مع إفراد علامة الشيكل.
   *
   * لا يكفي `textContent`: العلامة والرقم نصٌّ واحد، ولا سبيل لتصغير حرفٍ
   * منه بالأسلوب وحده. فتُفصَل في عنصرها، وتبقى الإشارة السالبة قبلها.
   */
  function setAmount(el, str) {
    el.textContent = '';
    var m = /^([−+]?)₪([\s\S]*)$/.exec(str);
    if (!m) { el.textContent = str; return; }
    if (m[1]) el.appendChild(document.createTextNode(m[1]));
    var c = document.createElement('span');
    c.className = 'cur';
    c.textContent = '₪';
    el.appendChild(c);
    el.appendChild(document.createTextNode(m[2]));
  }

  function line(host, name, work, amount, cls) {
    var row = document.createElement('div');
    row.className = 'lg' + (cls ? ' ' + cls : '');
    var l = document.createElement('span');
    l.className = 'name';
    l.textContent = name;
    if (work) {
      var w = document.createElement('span');
      w.className = /[×÷]/.test(work) ? 'work calc' : 'work';
      w.textContent = work;
      l.appendChild(w);
    }
    var a = document.createElement('span');
    a.className = 'amt';
    setAmount(a, amount);
    row.appendChild(l);
    row.appendChild(a);
    host.appendChild(row);
  }

  function render() {
    // ─── المدخلات
    document.getElementById('w').value = state.widthCm;
    document.getElementById('h').value = state.heightCm;
    document.getElementById('q').value = state.quantity;

    /* النوع أولًا ثم ألوانه: خمسة ألوانٍ مسرودةً معًا تُخفي أنها صنفان،
       وتطول القائمة كلما دخل لونٌ جديد. والانتقال بين نوعين يقفز إلى أول
       لونٍ فيه لأن ألوان الأول لا وجود لها في الثاني. */
    var KINDS = [
      { id: 'crepe', label: 'كريب جورجيت' },
      { id: 'other', label: 'بشتان' }
    ];
    chipRow(document.getElementById('products'), KINDS,
      function (it) { return it.id === state.kind; },
      function (it) {
        state.kind = it.id;
        state.fabric = FABRICS.filter(function (f) { return f.kind === it.id; })[0];
      });

    var shades = FABRICS.filter(function (f) { return f.kind === state.kind; });
    chipRow(document.getElementById('colors'),
      shades.map(function (f) { return { ref: f, label: f.color, hex: f.hex }; }),
      function (it) { return it.ref.id === state.fabric.id; },
      function (it) { state.fabric = it.ref; });

    chipRow(document.getElementById('linings'),
      LININGS.map(function (l) { return { ref: l, label: l.label, note: l.note }; }),
      function (it) { return it.ref.id === state.lining.id; },
      function (it) { state.lining = it.ref; });

    chipRow(document.getElementById('tracks'),
      TRACKS.map(function (t) { return { ref: t, label: t.label, note: t.note }; }),
      function (it) { return it.ref.id === state.track; },
      function (it) { state.track = it.ref.id; });

    var p = price(state);
    var t = totals(p.lineTotal, p.internalCost, state.discount);

    document.getElementById('dims-note').textContent =
      'عرض ' + num(state.widthCm) + ' سم × ارتفاع ' + num(state.heightCm) + ' سم' +
      (p.units > 1 ? ' × ' + num(p.units) + ' ستائر' : '');
    document.getElementById('band-note').textContent =
      p.overMax ? 'فوق 500 سم' : (p.band === 'standard' ? 'شريحة حتى 329' : 'شريحة 330–500');

    setAmount(document.getElementById('v-customer'), money(inclVat ? t.net : t.revenue));
    Array.prototype.forEach.call(document.querySelectorAll('.vat-seg button'), function (b) {
      b.setAttribute('aria-pressed', String((b.dataset.vat === '1') === inclVat));
    });
    setAmount(document.getElementById('v-cost'), money(p.internalCost));

    // ─── ورقة الزبون
    var C = document.getElementById('lg-customer');
    C.textContent = '';
    if (p.overMax) {
      line(C, 'لا تسعير تلقائي', 'الارتفاع فوق 500 سم', '—', 'muted');
    } else {
      line(C, 'سعر المتر الأساسي',
        (p.hasLining ? 'مع بطانة' : 'بلا بطانة') + ' • ' + (p.band === 'standard' ? 'حتى 329' : '330–500'),
        money(p.basePrice));
      if (p.surcharge > 0) {
        line(C, 'زيادة البطانة 100%', 'على المتر الطولي', '+' + money(p.surcharge), 'plus');
      }
      if (p.trackPrice > 0) {
        line(C, 'المسار الكهربائي', 'على المتر الطولي', '+' + money(p.trackPrice), 'plus');
      }
      line(C, 'سعر المتر الطولي', '', money(p.unitPrice), 'subtotal');
      line(C, 'الأمتار الطولية',
        num(state.widthCm) + ' سم ÷ 100' + (p.units > 1 ? ' × ' + num(p.units) : ''),
        m(p.runningMeters) + ' م', 'muted');
      line(C, 'ثمن الأمتار', sh(p.unitPrice) + ' × ' + m(p.runningMeters), money(p.metersTotal));
      if (p.motor) {
        line(C, 'ماتور', p.units > 1 ? sh(S.motorPrice) + ' × ' + num(p.units) : 'لكل ستارة',
          '+' + money(S.motorPrice * p.units), 'plus');
        line(C, 'جهاز تحكم', p.units > 1 ? sh(S.remotePrice) + ' × ' + num(p.units) : 'لكل ستارة',
          '+' + money(S.remotePrice * p.units), 'plus');
      }
      line(C, 'الإجمالي قبل الخصم', '', money(p.lineTotal), 'sum rev');
    }

    // ─── ورقة التكلفة
    var K = document.getElementById('lg-cost');
    K.textContent = '';
    line(K, state.fabric.name, sh(state.fabric.cost) + ' × ' + num(state.fullness),
      money(p.fabricPerRm));
    if (p.hasLining) {
      line(K, 'البطانة ' + state.lining.label,
        sh(state.lining.cost) + ' × ' + num(p.liningPerRm), money(p.liningPerRmCost));
    }
    line(K, 'الخياط', p.band === 'standard' ? 'ارتفاع عادي' : 'ارتفاع عالٍ', money(p.tailorCost));
    line(K, p.motor ? 'مسار كهربائي' : 'مسار عادي', 'لكل متر طولي', money(p.trackCost));
    line(K, 'التوصيل', 'لكل متر طولي', money(S.deliveryCost));
    line(K, 'القياس والتركيب', 'لكل متر طولي', money(S.installCost));
    line(K, 'التكلفة لكل متر طولي', '', money(p.perRmCost), 'subtotal');
    line(K, 'ثمن الأمتار', sh(p.perRmCost) + ' × ' + m(p.runningMeters), money(p.metersCost));
    if (p.motor) {
      line(K, 'ماتور', p.units > 1 ? sh(S.motorCost) + ' × ' + num(p.units) : 'لكل ستارة',
        '+' + money(S.motorCost * p.units), 'plus');
      line(K, 'جهاز تحكم', p.units > 1 ? sh(S.remoteCost) + ' × ' + num(p.units) : 'لكل ستارة',
        '+' + money(S.remoteCost * p.units), 'plus');
    }
    line(K, 'التكلفة الكاملة', '', money(p.internalCost), 'sum spend');

    document.getElementById('cost-note').textContent =
      'القماش المطلوب ' + m(p.fabricMeters) + ' متر' +
      (p.hasLining ? '، والبطانة ' + m(p.liningMeters) + ' متر' : '') +
      '. هذه الأمتار لا تظهر للزبون - عرضه بالأمتار الطولية وحدها.';

    // ─── النتيجة
    var F = document.getElementById('lg-final');
    F.textContent = '';
    line(F, 'الإجمالي قبل الخصم', '', money(p.lineTotal));
    if (t.discount > 0) {
      line(F, 'الخصم', state.discount + '%', '−' + money(t.discount), 'plus');
    }
    line(F, 'المجموع לא כולל מע"מ', 'عليه يُقاس الهامش', money(t.revenue));
    line(F, 'מע"מ', S.vatPercent + '%', '+' + money(t.vat), 'muted');
    line(F, 'المطلوب من الزبون', 'כולל מע"מ', money(t.net), 'sum rev');
    line(F, 'التكلفة الكاملة', '', '−' + money(p.internalCost));
    line(F, 'الربح', '', money(t.profit), 'sum profit');

    var mrow = document.createElement('div');
    mrow.className = 'lg';
    var ml = document.createElement('span');
    ml.className = 'name';
    ml.textContent = 'الهامش على الإيراد الصافي';
    var mp = document.createElement('span');
    mp.className = 'pill ' + (t.marginPercent >= S.minMarginPercent ? 'ok' : 'bad');
    mp.textContent = t.marginPercent.toFixed(2) + '%';
    mrow.appendChild(ml);
    mrow.appendChild(mp);
    F.appendChild(mrow);

    // ─── تفصيل الربح: الإيراد ثم كل بند تكلفة على حدة حتى الربح
    var D = document.getElementById('lg-detail');
    D.textContent = '';
    line(D, 'الإيراد', 'سعر البيع לא כולל מע"מ', money2(t.revenue));
    p.costItems.forEach(function (it) {
      line(D, it.label, it.work, '−' + money2(it.amount));
    });
    if (p.costRounding !== 0) {
      line(D, 'تنزيل المجموع إلى الشيكل', 'قاعدة «بلا أغوروت»',
        (p.costRounding > 0 ? '−' : '+') + money2(Math.abs(p.costRounding)), 'muted');
    }
    line(D, 'الربح', '', money2(t.profit), 'sum profit');

    document.getElementById('detail-note').textContent =
      'مجموع البنود ' + money2(p.internalCost) + ' - وهو نفسه «التكلفة على المحل» في الأعلى. ' +
      'الأغوروت تظهر هنا وحدها لأن البند الواحد ينتج كسرًا، والتطبيق ينزّل الكسر ' +
      'مرةً واحدة على المجموع لا على كل بند.';

    // ─── التنبيهات
    var G = document.getElementById('flags');
    G.textContent = '';
    if (p.overMax) {
      var s1 = document.createElement('div');
      s1.className = 'flag stop';
      s1.textContent = 'الارتفاع فوق 500 سم: لا تسعير تلقائي إطلاقًا. الشباك يحتاج سعرًا خاصًا تضعه بنفسك.';
      G.appendChild(s1);
    } else if (t.marginPercent < S.minMarginPercent && p.lineTotal > 0) {
      var s2 = document.createElement('div');
      s2.className = 'flag warn';
      s2.textContent = 'الهامش تحت الحد الأدنى 35% - التطبيق ينبّه على هذا البند.';
      G.appendChild(s2);
    }
    if (state.discount > 10) {
      var s3 = document.createElement('div');
      s3.className = 'flag warn';
      s3.textContent = 'خصم فوق 10% يتجاوز صلاحيتك أنت أيضًا - في التطبيق يحتاج قرارًا صريحًا.';
      G.appendChild(s3);
    }

    // ─── جدول الاحتمالات
    var M = document.getElementById('matrix');
    M.textContent = '';
    [{ kind: 'crepe', name: 'كريب' }, { kind: 'other', name: 'بشتان' }].forEach(function (kd) {
      var rep = FABRICS.filter(function (f) { return f.kind === kd.kind; })[0];
      LININGS.forEach(function (ln) {
        TRACKS.forEach(function (tk) {
          var pp = price({
            widthCm: state.widthCm, heightCm: state.heightCm, quantity: state.quantity,
            fabric: rep, lining: ln, track: tk.id, fullness: FULLNESS
          });
          var tt = totals(pp.lineTotal, pp.internalCost, state.discount);
          var tr = document.createElement('tr');
          var cls = [];
          if (rep.kind === state.fabric.kind && ln.id === state.lining.id && tk.id === state.track) {
            cls.push('here');
          }
          // فاصلٌ بين كتلة الكريب وكتلة البشتان - اثنتا عشرة سطرًا متصلة
          // تُقرأ قائمةً واحدة، وهي في الحقيقة مقارنتان
          if (kd.kind === 'other' && ln.id === 'none' && tk.id === 'standard') {
            cls.push('block-start');
          }
          tr.className = cls.join(' ');
          [kd.name, ln.label, tk.label].forEach(function (txt) {
            var td = document.createElement('td');
            td.textContent = txt;
            tr.appendChild(td);
          });
          [money(pp.unitPrice), money(tt.revenue), money(pp.internalCost),
           tt.marginPercent.toFixed(1) + '%'].forEach(function (txt, ci) {
            var td = document.createElement('td');
            // الهامش دون الحد الأدنى يُلوَّن: العمود طويل، والعين تمسحه
            // بحثًا عن الشاذّ لا قراءةً لكل رقم فيه
            td.className = 'n' + (ci === 3 && tt.marginPercent < S.minMarginPercent ? ' low' : '');
            setAmount(td, txt);
            tr.appendChild(td);
          });
          M.appendChild(tr);
        });
      });
    });
  }

  function bindNumber(id, key, min) {
    var el = document.getElementById(id);
    el.addEventListener('input', function () {
      var v = parseFloat(el.value);
      state[key] = isFinite(v) && v >= min ? v : min;
      render();
    });
  }
  bindNumber('w', 'widthCm', 1);
  bindNumber('h', 'heightCm', 1);
  bindNumber('q', 'quantity', 1);

  Array.prototype.forEach.call(document.querySelectorAll('.vat-seg button'), function (b) {
    b.addEventListener('click', function () {
      inclVat = b.dataset.vat === '1';
      render();
    });
  });

  var d = document.getElementById('d');
  d.addEventListener('input', function () {
    state.discount = parseInt(d.value, 10) || 0;
    document.getElementById('d-label').textContent = state.discount + '%';
    render();
  });

  render();
})();

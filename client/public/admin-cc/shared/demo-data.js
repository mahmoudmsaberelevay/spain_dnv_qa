/*
 * EXAMPLE data for demo mode and first-run testing. Not real ELEVAY results.
 * News headlines are placeholders and must not be published.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.ElevayDemo = factory(root.ElevayEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const DISC = 'يخضع لموافقة الجهات الحكومية المختصة، ووفقًا للظروف الفردية لكل حالة.';

  const captions = {
    family: `مستقبل عائلتك يبدأ بقرار مدروس اليوم.

يبحث كثير من العائلات في المنطقة عن استقرار طويل الأمد يمنح الأبناء تعليمًا دوليًا وفرصًا أوسع، ويمنح الوالدين مرونة في التنقل والعمل. الإقامة الأوروبية ليست مجرد وثيقة، بل مسار متكامل يحتاج إلى تخطيط دقيق يبدأ بفهم وضعك المالي والمهني وأهداف أسرتك.

في ELEVAY نرافقك منذ الاستشارة الأولى، فنقارن بين البرامج المتاحة في إسبانيا والبرتغال واليونان، ونوضح لك المتطلبات الحالية من مصادرها الرسمية، ونبني معك خطة واضحة الخطوات بعيدًا عن الوعود غير الواقعية.

اختيار البرنامج المناسب يعتمد على تفاصيلك أنت، لذلك نبدأ دائمًا بالاستماع قبل التوصية، ونراجع معك الخيارات بشفافية كاملة حتى تتخذ قرارك بثقة واطمئنان.

${DISC}

احجز استشارتك الخاصة مع مستشاري ELEVAY عبر الرابط في الملف الشخصي.`,
    spainDnv: `العمل عن بُعد قد يفتح لك باب الإقامة في إسبانيا.

إذا كنت تعمل لصالح شركة أو عملاء خارج إسبانيا، فقد يتيح لك برنامج إقامة الرحّالة الرقميين العيش في واحدة من أجمل الدول الأوروبية مع الاستمرار في عملك الحالي. يعتمد التأهل على عدة عناصر، منها طبيعة عقد العمل، ومستوى الدخل الشهري، والمؤهلات أو الخبرة المهنية، إضافة إلى التأمين الصحي والسجل الجنائي.

يقدّم فريق ELEVAY تقييمًا أوليًا لملفك، ويوضح لك المستندات المطلوبة وفق أحدث الاشتراطات الرسمية، ويرافقك في تجهيز الملف بعناية واحترافية حتى تقديمه، مع متابعة كل مرحلة بشفافية.

نؤمن بأن القرار الصحيح يبدأ بمعلومة دقيقة، لذلك نراجع كل الأرقام من مصادرها الحكومية قبل أي توصية.

${DISC}

تعرّف على مدى توافق ملفك مع البرنامج، وتواصل مع ELEVAY عبر الرابط في الملف الشخصي.`,
    portugalD7: `دخلك الثابت قد يكون بوابتك إلى البرتغال.

يناسب برنامج الإقامة البرتغالية للدخل السلبي أصحاب المعاشات وعوائد الإيجار والأرباح الموزعة ممن يرغبون في حياة هادئة على ساحل الأطلسي. ويتطلب البرنامج إثبات دخل منتظم ومستقر، وسكنًا مناسبًا في البرتغال، إلى جانب متطلبات أخرى تختلف بحسب تكوين الأسرة.

يساعدك مستشارو ELEVAY على مراجعة مصادر دخلك وتنظيم المستندات المالية، وشرح الخطوات بوضوح منذ البداية، مع التنسيق مع مختصين قانونيين معتمدين عند الحاجة لضمان دقة كل تفصيلة في ملفك.

لكل أسرة ظروفها الخاصة، ولذلك نصمم الخطة بما يتناسب مع أهدافك على المدى الطويل، سواء كانت الاستقرار أو التعليم أو التقاعد.

${DISC} يُنصح بالتشاور مع مستشار قانوني.

ابدأ بخطوة واضحة، واحجز استشارتك مع ELEVAY عبر الرابط في الملف الشخصي.`,
    greece: `استثمار عقاري مدروس قد يمنحك إقامة في اليونان.

يجمع برنامج الإقامة الذهبية اليوناني بين امتلاك عقار في بلد أوروبي ذي طابع متوسطي فريد، وبين حق الإقامة للمستثمر وأفراد أسرته وفق الشروط المعمول بها. وتختلف قيمة الاستثمار المطلوبة بحسب المنطقة ونوع العقار، كما تخضع الشروط لتحديثات دورية من الجهات المختصة.

يتابع فريق ELEVAY هذه التحديثات من مصادرها الرسمية، ويساعدك على فهم الخيارات المتاحة، ومقارنة المناطق، وتنظيم الخطوات مع شركاء قانونيين وعقاريين موثوقين في اليونان، حتى تتخذ قرارك الاستثماري على أساس واضح.

نحرص على أن يكون قرارك مبنيًا على معلومات محدّثة وتوقعات واقعية، دون أي التزام بنتائج لا يمكن ضمانها.

${DISC} تطبق الشروط والأحكام.

اكتشف الخيار المناسب لك، وتواصل مع ELEVAY عبر الرابط في الملف الشخصي.`,
  };

  // Deliberately non-compliant example, to show how QC blocks it.
  const flawed = `فرصتك الأخيرة للحصول على تأشيرة البرتغال بسهولة!

عدد محدود من الملفات هذا الشهر، والموافقة مضمونة مع فريقنا. سارع بالتسجيل الآن قبل انتهاء العرض.

تواصل معنا على واتساب 01000000000.`;

  function brief(id, type, topic, pillar, program, caption, extra) {
    return Object.assign({
      item_id: id, version: 1, type, status: 'pending_approval', topic, pillar, program,
      source: { url: '', confidence: 'verified' }, caption_ar: caption, disclaimer_used: 'Subject to government approval; Based on individual circumstances',
      design: { format: '1080x1080', image_prompt: '', headline_en: '' },
      talent: { mode: 'none', influencer_id: 'higgsfield-influencer-default', voice_source: 'elevay_vip_module', speech_language: 'egyptian_arabic' },
      publish: { channel: 'both', datetime_cairo: '' }, qc: { checks_passed: ['palette', 'people', 'footwear', 'logo_clear_space'], checks_failed: [], reviewer: 'claude' },
    }, extra || {});
  }

  const imgPrompt = (scene) => `${scene} Editorial diagonal composition, warm natural light, premium lifestyle photography. People are Arab / Middle Eastern in modern elegant clothing, complete outfits with polished formal footwear. No passports, no flags as hero objects, no handshakes. No logo, no text other than the English headline, no contact details. ELEVAY palette: dark navy, baby blue, off-white, gold accent only.`;

  const reel = (scenes, mode) => ({
    storyboard: scenes.map((s, i) => ({ clip: i + 1, keyframe_prompt: s[0], motion_prompt: s[1], spoken_text_ar: s[2] || '', delivery_direction_en: s[2] ? 'Calm, warm, premium advisory tone' : '' })),
    music_direction: 'Soft cinematic piano with light strings, royalty-free', duration_s: 23,
  });

  function build() {
    const st = E.emptyState();
    // ---- history: 3 past weeks presented (approval-rate tracker)
    const past = [['2026-W38', [1, 1, 1, 1, 0, 1, 1]], ['2026-W39', [1, 1, 1, 1, 1, 1, 0]], ['2026-W40', [1, 1, 1, 1, 1, 1, 1]]];
    for (const [w, fp] of past) {
      fp.forEach((f, i) => {
        const id = `${w}-0${i + 1}`;
        st.items.push({ item_id: id, version: f ? 1 : 2, type: i % 2 ? 'reel' : 'static', status: 'published', topic: 'Example past post', pillar: 'Global Mobility', program: 'Evergreen / multi-program', caption_ar: '', presented_at: '2026-09-20T06:00:00Z', first_pass: !!f, owner_comments: [], history: [], compliance: { pass: true, blocks: [], warnings: [], checks: [] }, publish: { channel: 'both', datetime_cairo: '' } });
      });
    }

    // ---- current week W41: 4 static + 3 reels
    const W = '2026-W41';
    const items = [
      brief(`${W}-01`, 'static', 'Family security through European residency', 'Family Security', 'Evergreen / multi-program', captions.family, {
        design: { format: '1080x1080', headline_en: 'Plan your family’s next chapter', image_prompt: imgPrompt('An Arab family of four walking through a sunlit Lisbon street, parents in tailored linen, children in smart casual wear.') },
        publish: { channel: 'both', datetime_cairo: '2026-10-11T20:00' },
      }),
      brief(`${W}-02`, 'reel', 'Working remotely from Spain', 'Global Mobility', 'Spain Digital Nomad Residency', captions.spainDnv, {
        reel: reel([
          ['Arab professional woman in a tailored navy blazer, trousers and polished loafers at a Madrid café terrace with a laptop, golden hour', 'Slow push-in, steam rising from coffee'],
          ['Same Arab woman walking past Gran Vía architecture, full outfit and formal shoes visible', 'Tracking shot, steady and smooth'],
          ['Consultation room with an Arab advisor in an elegant suit and polished oxfords reviewing plans (no passports visible)', 'Static with subtle rack focus'],
          ['Same Arab woman in the same tailored outfit on a balcony at sunset overlooking Madrid rooftops', 'Slow pull-back, warm light'],
        ]),
        publish: { channel: 'both', datetime_cairo: '2026-10-12T21:00' },
      }),
      brief(`${W}-03`, 'static', 'Passive income route to Portugal', 'Long-term Planning', 'Portugal D7', captions.portugalD7, {
        design: { format: '1080x1350', headline_en: 'Your income. Your coastline.', image_prompt: imgPrompt('A retired Arab couple on a terrace above the Cascais coast, elegant resort wear and leather loafers.') },
        publish: { channel: 'instagram', datetime_cairo: '2026-10-13T19:30' },
      }),
      brief(`${W}-04`, 'reel', 'What a premium advisory process looks like', 'Premium Service', 'Evergreen / multi-program', captions.family, {
        talent: { mode: 'influencer', influencer_id: 'higgsfield-influencer-default', voice_source: 'elevay_vip_module', speech_language: 'egyptian_arabic' },
        reel: reel([
          ['Arab AI influencer in a charcoal suit and polished oxfords in a bright modern office', 'Medium shot, subtle push-in', 'كل قرار كبير محتاج خطة واضحة من الأول'],
          ['Influencer seated at a consultation table, notes in hand', 'Over-the-shoulder, slow arc', 'بنبدأ نسمعك ونفهم أهدافك وأهداف عيلتك كويس'],
          ['Influencer gesturing at a tablet with a map of Europe', 'Close-up on hands then face', 'وبعدين نقارن البرامج المتاحة بالمعلومة الرسمية المحدثة'],
          ['Influencer smiling at a window overlooking the city', 'Slow pull-back', 'وده كله بشفافية ومن غير وعود مش واقعية'],
        ]),
        publish: { channel: 'both', datetime_cairo: '2026-10-14T21:00' },
      }),
      brief(`${W}-05`, 'static', 'Greece real-estate residency explained', 'Global Mobility', 'Greece Golden Residency', captions.greece, {
        source: { url: 'https://example.gov/placeholder', confidence: 'reported' },
        design: { format: '1080x1080', headline_en: 'Invest in a Mediterranean future', image_prompt: imgPrompt('An Arab businessman in a light suit and polished oxfords on a whitewashed Athens rooftop terrace overlooking the city.') },
        publish: { channel: 'facebook', datetime_cairo: '2026-10-15T20:00' },
      }),
      brief(`${W}-06`, 'reel', 'Lisbon lifestyle for families', 'Family Security', 'Portugal D7', captions.portugalD7, {
        talent: { mode: 'voiceover_elevay_vip', influencer_id: '', voice_source: 'elevay_vip_module', speech_language: 'egyptian_arabic' },
        reel: reel([
          ['Arab family having breakfast on a Lisbon balcony', 'Slow dolly in', 'تخيل صباحك على شاطئ الأطلسي مع عيلتك'],
          ['Arab children in smart school uniforms walking to an international school', 'Tracking shot', 'تعليم دولي لأولادك في بيئة آمنة وهادية'],
          ['Parents reviewing plans with an advisor', 'Static, rack focus', 'الخطة الصح بتبدأ بمراجعة دخلك وأهدافك بدقة'],
          ['Arab family in elegant casual clothing walking along the Tagus riverfront at sunset', 'Wide pull-back', 'خلينا نرتب الخطوة الجاية سوا بهدوء ووضوح'],
        ]),
        publish: { channel: 'both', datetime_cairo: '2026-10-16T21:00' },
      }),
      brief(`${W}-07`, 'static', 'Portugal promotion (needs rewrite)', 'Global Mobility', 'Portugal Golden Residency', flawed, {
        design: { format: '1080x1080', headline_en: 'Get your Portugal visa fast', image_prompt: imgPrompt('A passport on a desk next to a Portuguese flag.') },
        publish: { channel: 'both', datetime_cairo: '2026-10-17T20:00' },
      }),
    ];
    for (const b of items) E.upsertBrief(st, b, 'manus');

    // One change request already in flight
    E.decideItem(st, `${W}-05`, 'request_changes', { comment: 'Make the caption hook shorter and mention family members can be included.' }, 'mahmoud.saber@elevay.com', 'owner');

    // ---- Meta report (example numbers)
    E.addReport(st, {
      month: '2026-10', asOf: '2026-10-05', week: '2026-W41', spendMtdEgp: 37200,
      reach: 412000, impressions: 1280000, videoViews: 356000, thruPlayRate: 0.18, pageLikes: 1640, leads: 498, qualifiedLeads: 41, signedClients: 3,
      ctr: 0.0142, cpm: 29.1, frequency: 1.8,
      adsets: [
        { name: 'LeadGen | GCC families | Portugal D7', spendEgp: 14100, leads: 231, cplHistory: [{ date: '2026-10-03', cpl: 58, spend: 4600 }, { date: '2026-10-04', cpl: 62, spend: 4700 }, { date: '2026-10-05', cpl: 61, spend: 4800 }] },
        { name: 'LeadGen | Egypt professionals | Spain DNV', spendEgp: 12600, leads: 198, cplHistory: [{ date: '2026-10-03', cpl: 66, spend: 4200 }, { date: '2026-10-04', cpl: 63, spend: 4100 }, { date: '2026-10-05', cpl: 62, spend: 4300 }] },
        { name: 'LeadGen | KSA investors | Greece', spendEgp: 6900, leads: 52, cplHistory: [{ date: '2026-10-03', cpl: 121, spend: 2300 }, { date: '2026-10-04', cpl: 138, spend: 2300 }, { date: '2026-10-05', cpl: 144, spend: 2300 }] },
        { name: 'Reach | Reels | MENA broad', objective: 'reach', spendEgp: 3600, leads: 17, cplHistory: [] },
      ],
      topCreatives: ['2026-W40-02 (reel)', '2026-W40-04 (reel)', '2026-W40-01 (static)'],
      bottomCreatives: ['2026-W40-05 (static)', '2026-W39-07 (static)'],
    }, 'manus');

    // ---- Friday action plan
    E.upsertActions(st, [
      { week: W, kind: 'budget', change: 'Move 1,500 EGP/day from "KSA investors | Greece" to "GCC families | Portugal D7"', reason: 'Portugal D7 ad set holds a 60 EGP CPL over 3 days; Greece is above 120 EGP.', expected_impact: '+20–25 leads/day at a lower blended CPL', risk: 'Greece learning phase resets', rollback: 'Restore both daily budgets to their previous values', budget_delta_egp: 0 },
      { week: W, kind: 'creative', change: 'Promote reel 2026-W40-02 into the Spain DNV lead campaign as a new ad', reason: 'Best ThruPlay rate of the month (organic).', expected_impact: 'Lower CPM and higher CTR on Spain DNV', risk: 'Creative fatigue on organic audience', rollback: 'Pause the new ad', budget_delta_egp: 0 },
      { week: W, kind: 'lead_form', change: 'Add a "planned investment range" qualifying question to the lead form', reason: 'Qualified rate is 8.2%, below the 10% target.', expected_impact: 'Qualified rate toward 10%+, slightly fewer raw leads', risk: 'CPL may rise 5–10%', rollback: 'Remove the question', budget_delta_egp: 0 },
      { week: W, kind: 'budget', change: 'Raise the Reach campaign by 4,000 EGP/day', reason: 'Views are pacing behind the 2M target.', expected_impact: '+300k views/week', risk: 'Pushes projected spend over the monthly cap', rollback: 'Return to the previous daily budget', budget_delta_egp: 4000 },
    ], 'manus');

    // ---- news (placeholders)
    E.addNews(st, [
      { headline: 'Example: Portugal updates guidance for residency renewals', country: 'Portugal', program: 'Portugal D7', what_changed: 'Placeholder text. Manus will replace with verified items.', effective_date: '2026-11-01', source_url: 'https://example.gov/placeholder-1', confidence: 'verified', marketing_angle: 'Reassure existing residents about renewal planning.', selected: true },
      { headline: 'Example: Spain publishes FAQ on remote-work residency income proof', country: 'Spain', program: 'Spain Digital Nomad Residency', what_changed: 'Placeholder text.', effective_date: '2026-10-15', source_url: 'https://example.gov/placeholder-2', confidence: 'reported', marketing_angle: 'Explain what documents freelancers usually prepare.', selected: true },
      { headline: 'Example: Rumoured change to Caribbean CBI due diligence fees', country: 'Caribbean', program: 'Caribbean Citizenship by Investment', what_changed: 'Placeholder text.', effective_date: '', source_url: 'https://example.com/placeholder-3', confidence: 'unconfirmed', marketing_angle: 'Do not use until confirmed.', selected: false },
    ], 'manus');

    E.addPlan(st, { month: '2026-11', title: 'November 2026 marketing plan (example)', body: 'KPI funnel, budget split (lead gen ~140,000 EGP at ≤70 EGP CPL; ~60,000 EGP reach, page likes and retargeting), audience tests, content calendar by pillar, creative tests, Meta policy checks, risks. Manus delivers the full plan here in the last week of each month.' }, 'manus');

    // ---- a few job states to show the Manus bridge
    if (st.jobs[0]) E.setJobStatus(st, st.jobs[st.jobs.length - 1].id, 'in_progress', {}, 'manus');
    const ask = E.enqueueJob(st, 'custom', { request: 'Prepare 3 hook variations for the Greece static post' }, 'mahmoud.saber@elevay.com');
    ask.manus.question = { text: 'Should the hooks focus on investment value or on family lifestyle?', options: ['Investment value', 'Family lifestyle'] };
    E.setJobStatus(st, ask.id, 'needs_input', {}, 'manus');
    return st;
  }

  return { build };
});

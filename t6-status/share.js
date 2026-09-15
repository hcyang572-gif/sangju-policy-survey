/* ══════════════════════════════════════════════════════════════════════
   의견조사 접수현황(팀 공유) — share.js                       🩵물결
   ────────────────────────────────────────────────────────────────────
   이 화면이 지키는 약속

   ① ⛔ 개별 응답을 «한 줄도» 그리지 않는다.
      주관식(q22·q23) · 접수번호 · 제출시각 원값 · 소속×업무×경력 교차표 —
      이 파일 어디에도 그 값을 읽는 코드가 없다.
      (로그인 없이 열리는 주소다. 카톡이 한 번 전달되면 링크를 가진 누구나 본다)

   ② ⛔ survey_responses 를 «부르지 않는다».
      🩷자물쇠가 판 집계 전용 표 public.survey_public_stats 한 줄만 읽는다.
      그 표에는 개인정보가 처음부터 없고, survey_responses 는 그대로 잠겨 있다.

   ③ ⭐⭐ 구독 이벤트는 INSERT 가 «아니라» UPDATE 다.
      이 표는 «한 줄만 두고 계속 고쳐 쓰는» 표다. INSERT 를 구독하면
      SUBSCRIBED 는 뜨는데 이벤트가 영영 오지 않는다 — 겉보기엔 잘 붙은 것처럼
      보이는, 이 저장소가 가장 경계하는 «조용한 실패» 다.
      ⛔ 아래 event 를 INSERT 로 바꾸지 마십시오.

   ④ ⛔ 끊긴 채로 「실시간」이라고 적지 않는다.
      붙어 있을 때만 「실시간」이고, 끊기면 글자·색이 함께 바뀌며 그때부터만
      폴백 폴링이 돈다. 화면 문구는 주기 상수에서 «계산해» 쓰므로
      주기와 문구가 갈려 거짓말하는 일이 구조적으로 생기지 않는다.

   ⑤ ⛔ 서버가 뭉갠 값을 화면이 되돌리지 않는다.
      dept_counts 의 n === null 은 «3건 미만» 이라는 뜻이다. 0 으로도, 추정값으로도
      바꾸지 않는다. 막대 길이까지 감춘다(1건과 2건이 길이로 구분되면 가린 뜻이 없다).

   ⑥ ⛔ 평균을 지어내지 않는다.
      자물쇠가 «차분 공격»(새평균×(n+1) − 옛평균×n 으로 방금 낸 사람의 답이 드러나는 것)을
      막으려고, 평균을 «가장 오래된 5의 배수 개» 로만 계산하고 10건 전에는 아예 주지 않는다.
      ⇒ avgs 가 비면 빈 막대나 0.0 을 그리지 말고 「10건부터」라고 적는다.
        avg_n 과 total_n 이 다른 것이 «정상» 이므로 그 차이를 화면에 사실대로 적는다.
      ⛔ 기관별 평균은 «없다». 만들어 내지 마십시오.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var S = window.SURVEY;

  /* ── 집계 전용 표 (🩷자물쇠 · 설문조사_260911.sql [6-1]·[7-1]절) ──
     ⛔ 다른 표·뷰·함수를 부르지 마십시오. anon 에게 열린 곳은 여기 하나뿐입니다. */
  var TABLE = "survey_public_stats";

  /* ── 주관식 공개 표 (🩷자물쇠 확정 · anon 에 SELECT 만 열려 있습니다) ──
     칼럼은 이 넷뿐입니다 — pub_key(행 식별자) · qno(22 또는 23) · ord(정렬키) · body(본문).
     ⛔ 시각·제출순 칼럼이 «아예 없습니다». 일부러 없앤 것이니
        「언제 들어왔는지」를 적으려 들지 마십시오 — 적을 자료가 없습니다.
     ⛔ ord 는 «화면에 보이는 번호가 아닙니다». 번호를 매기려면 보이는 순서대로 1,2,3.
     ⛔ 새 Realtime 구독을 만들지 마십시오. 갱신 신호는 위 TABLE 의 UPDATE 하나로 받고,
        받으면 집계 한 줄과 이 목록을 «함께» 다시 읽습니다(loadOpinions 를 같이 부릅니다). */
  var OPINIONS = "survey_public_opinions";

  /* 주관식 문항 이름표 — 원문은 ../app.js 의 문22·문23 정의입니다. 바뀌면 함께 고치십시오. */
  var OPQ = [
    { qno: 22, t: "추가·개선되었으면 하는 기능, 공고·홍보에 바라시는 점" },
    { qno: 23, t: "그 밖에 하고 싶은 말씀" }
  ];

  /* ⭐ 글자가 하나도 없는 답변(「.」·「-」·공백뿐)은 싣지 않습니다.
     「없음」·「좋아요」처럼 «짧아도 글자로 적은 것» 은 뜻을 담아 낸 답이므로 그대로 싣습니다
     (양호창님 2026-09-15 : 「.만 있는 건 걸러줘」 — 이 선을 넘지 마십시오).
     ⚠ 공개 표가 이미 걸러 주더라도 화면에서 한 번 더 봅니다 — 규칙이 한쪽만 바뀌어도
       「.」 한 줄이 팀 화면에 뜨는 일이 없게 하려는 것입니다. */
  /* ⚠ ㅡ(U+3161, 가운뎃점 모음 하나만 있는 자모)는 화면에서 "-" 와 구별이 안 되고
     실제로도 "ㅡㅡ"(무표정) 처럼 뜻 없는 필러로 쓰입니다 — 범위에서 뺍니다.
     [검수 2026-09-15] ㄱ-ㆎ 전체를 넣으면 "ㅡㅡ" 가 «글자 있음» 으로 잘못 판정되어
     그려지는 결함이 있었습니다(node 로 실측: HAS_LETTER.test("ㅡㅡ") === true). */
  var HAS_LETTER = /[0-9A-Za-z가-힣ㄱ-ㅠㅢ-ㆎ]/;

  /* 실시간이 «끊겼을 때만» 도는 폴백 주기.
     ⭐ 화면 문구는 이 값에서 만들어 씁니다 — 손으로 적지 마십시오. */
  var POLL_MS = 30000;
  var WATCHDOG_MS = 15000;   // 이 시간 안에 SUBSCRIBED 가 없으면 끊긴 것으로 본다

  /* 척도 문항 이름표. 값은 «서버가 준 평균» 을 그대로 씁니다. */
  var MEANS = [
    { key: "q4",  t: "문4 · 반복 문의 응대 부담" },
    { key: "q7",  t: "문7 · 시민 스스로 찾으면 업무 경감" },
    { key: "q8",  t: "문8 · 홍보가 대상자에게 닿지 않는 어려움" },
    { key: "q11", t: "문11 · ㉮ 공고 한곳에 모으기" },
    { key: "q12", t: "문12 · ㉯ 맞춤 검색·온라인 신청" },
    { key: "q13", t: "문13 · ㉰ 접수 현황 관리" },
    { key: "q14", t: "문14 · ㉱ 엑셀·현황 자동화" },
    { key: "q15", t: "문15 · ㉲ 정책제안·회신" },
    { key: "q17", t: "문17 · 우리 부서 업무에 도움" },
    { key: "q18", t: "문18 · 사용할 의향" },
    { key: "q21", t: "문21 · 복지 밖 분야로 확대 필요" }
  ];

  /* ── 도구 ─────────────────────────────────────────────────────── */
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  /* ⭐⭐ null 은 «0» 이 아닙니다.
     서버가 「3건 미만이라 가렸다」는 뜻으로 보낸 null 을 0 으로 바꾸면
     가린 것이 도로 드러납니다(2026-09-11 실측으로 한 번 잡은 결함입니다).
     ⛔ Number(null) 이 0 이라는 것을 잊지 마십시오. */
  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    var x = Number(v);
    return isFinite(x) ? x : null;
  }

  // 서울 기준 날짜 'YYYY-MM-DD' — 보시는 분의 기기 시간대가 어디든 한국 날짜가 나옵니다.
  function seoulDay(d) {
    try { return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }
  function ago(iso) {
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return "–";
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "방금";
    if (s < 3600) return Math.floor(s / 60) + "분 전";
    if (seoulDay(new Date(t)) === seoulDay(new Date())) return Math.floor(s / 3600) + "시간 전";
    if (seoulDay(new Date(t)) === seoulDay(new Date(Date.now() - 86400000))) return "어제";
    var d = new Date(t);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
  /* 마감까지 남은 날 — «한국시간» 기준.
     ⛔ new Date(S.기간끝) 처럼 시간대 없이 쓰지 마십시오. UTC 자정으로 읽혀
       한국에서는 오전 9시가 되고 남은 날수가 하루 어긋납니다. */
  function daysLeft() {
    return Math.ceil((new Date(S.마감ISO).getTime() - Date.now()) / 86400000);
  }
  function 기간글() {
    return "조사 기간 " + S.기간시작 + "(" + S.시작요일 + ") ~ " +
           S.기간끝 + "(" + S.마감요일 + ") · " + S.총일수 + "일간";
  }

  /* ── 상태 ─────────────────────────────────────────────────────── */
  var sb = null, channel = null, rtGen = 0, rtOk = false, rtTries = 0;
  var pollTimer = null, rtTimer = null, watchdog = null;
  var everOk = false, busy = false;

  /* 주관식은 «집계와 따로» 셉니다 — 한쪽이 실패해도 다른 쪽은 그려지게 하려는 것입니다. */
  var opBusy = false, opEverOk = false;
  var opOpen = Object.create(null);   // 펼쳐 둔 답변(pub_key) — 다시 그려도 펼친 채로 둡니다
  var opResizeTimer = null;

  function confVal(a, b) { if (typeof a !== "undefined" && a) return a; return b || null; }

  function boot() {
    if (!S || !S.기관) {
      fail("설정을 읽지 못했습니다", "현황/survey_const.js 가 함께 배포되었는지 확인해 주십시오.");
      return;
    }
    $("period").textContent = 기간글() + " · 대상 " + S.GOAL + "명" + (S.잠정 ? "(잠정)" : "");
    $("goalTxt").textContent = "목표 " + S.GOAL + "건" + (S.잠정 ? "(잠정)" : "");
    setStatus("wait", "불러오는 중…");

    var url = confVal(typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : null, window.SUPABASE_URL);
    var key = confVal(typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : null, window.SUPABASE_ANON_KEY);
    if (!window.supabase || !window.supabase.createClient || !url || !key) {
      fail("접속 설정을 읽지 못했습니다",
           "잠시 뒤 다시 열어 보십시오. 행정망 안에서는 접속이 막혀 있을 수 있습니다.");
      return;
    }
    sb = window.supabase.createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    load();
    subscribe();

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      // 다른 앱에 갔다 오면 타이머가 늦춰지고 소켓이 잠들 수 있습니다 — 즉시 한 번 맞춰 봅니다.
      load();
      if (!rtOk) { rtTries = 0; subscribe(); }
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     [실시간] ⭐⭐ 듣는 이벤트가 INSERT 가 «아닙니다».
     이 표는 한 줄을 «고쳐 쓰는» 표라 오는 것은 UPDATE 입니다.
     INSERT 만 구독하면 SUBSCRIBED 는 뜨는데 이벤트가 영영 오지 않습니다.
     ⚠ anon 에게 이 표의 SELECT 정책이 있어야 payload 가 실려 옵니다
       (자물쇠가 열어 두었습니다). survey_responses 와 달리 로그인·setAuth 가 필요 없습니다.
     ══════════════════════════════════════════════════════════════════ */
  function subscribe() {
    if (!sb) return;
    clearTimeout(rtTimer); rtTimer = null;

    // 옛 채널을 치우면 그 채널이 CLOSED 를 «뒤늦게» 보냅니다. 세대로 걸러 버립니다.
    var gen = ++rtGen;
    if (channel) { var old = channel; channel = null; try { sb.removeChannel(old); } catch (e) {} }

    clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      if (gen !== rtGen || rtOk) return;
      console.warn("[접수현황] 구독 응답이 없습니다 — 끊긴 것으로 봅니다");
      dropped("NO_RESPONSE");
    }, WATCHDOG_MS);

    try {
      channel = sb.channel("t6-stats-" + gen + "-" + Date.now())
        .on("postgres_changes",
            // ⛔ INSERT 로 바꾸지 마십시오. '*' 인 것은 UPDATE 를 받으면서
            //    자물쇠가 첫 줄을 «만들 때»(INSERT)도 놓치지 않으려는 것입니다.
            { event: "*", schema: "public", table: TABLE },
            function (payload) {
              var row = payload && (payload.new || payload.record);
              // replica identity full 이라 payload 에 «행 전체» 가 실려 옵니다 — 다시 조회할 필요가 없습니다.
              // ⭐ 이 신호 하나로 «집계 한 줄 + 주관식 목록» 을 함께 맞춥니다.
              //    주관식에 별도 구독을 걸지 않는 까닭이 이것입니다.
              if (row && row.total_n !== undefined && row.total_n !== null) {
                paint(normalize(row));
                loadOpinions();
              } else load();
            })
        .subscribe(function (status, err) {
          if (gen !== rtGen) return;                  // 옛 채널의 뒷북 — 버린다
          if (status === "SUBSCRIBED") {
            rtOk = true; rtTries = 0;
            clearTimeout(watchdog); watchdog = null;
            stopPoll();
            refreshStatus();
            load();                                   // 붙는 동안 놓친 갱신을 한 번 맞춘다
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (err) console.warn("[접수현황] 구독 상태", status, err);
            dropped(status);
          }
        });
    } catch (e) {
      // ⛔ 실시간이 죽어도 화면은 살아 있어야 합니다 — 조용히 폴링으로 물러납니다.
      console.warn("[접수현황] 구독을 걸지 못했습니다", e);
      dropped("EXCEPTION");
    }
  }

  function dropped(status) {
    rtOk = false;
    clearTimeout(watchdog); watchdog = null;
    refreshStatus();
    startPoll();
    rtTries = Math.min(rtTries + 1, 6);
    var wait = [1000, 2000, 4000, 8000, 15000, 30000][rtTries - 1];
    clearTimeout(rtTimer);
    rtTimer = setTimeout(subscribe, wait);
  }

  function startPoll() { if (pollTimer === null) pollTimer = setInterval(load, POLL_MS); }
  function stopPoll() { if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; } }

  /* ⭐ 머리말 표시는 «여기 한 곳» 에서만 정합니다.
     ⛔ 다른 곳에서 직접 바꾸지 마십시오 — 화면이 곧 거짓말을 합니다. */
  function setStatus(kind, text) {
    $("dot").className = "dot" + (kind ? " " + kind : "");
    $("refreshTxt").textContent = text;
  }
  function refreshStatus() {
    if (!rtOk) {
      setStatus("bad", "실시간 연결이 끊겼습니다 — " +
                       Math.round(POLL_MS / 1000) + "초마다 다시 확인합니다");
      return;
    }
    // 붙어는 있는데 아직 보여 줄 숫자가 없는 동안(표가 없거나 못 읽은 동안)
    // 「실시간」이라고 적으면 팀원이 «숫자가 멈춘 것» 으로 오해합니다.
    if (!everOk) { setStatus("wait", "접수를 기다리고 있습니다"); return; }
    setStatus("live", "실시간 — 새 응답이 들어오면 바로 바뀝니다");
  }

  /* ── 불러오기 ─────────────────────────────────────────────────── */
  function load() {
    // ⭐ 주관식을 먼저, 그리고 «따로» 읽습니다. 집계가 busy 여도 주관식은 갱신됩니다.
    loadOpinions();
    if (!sb || busy) return;
    busy = true;
    // ⛔ survey_responses 가 아니라 «집계 표 한 줄» 입니다.
    sb.from(TABLE).select("*").limit(1)
      .then(function (res) {
        busy = false;
        if (res.error) { onError(res.error); return; }
        var rows = res.data || [];
        // 표는 있는데 줄이 없다 = 아직 첫 응답 전. 오류가 «아닙니다».
        paint(normalize(rows.length ? rows[0] : null));
      })
      .catch(function (e) { busy = false; onError(e); });
  }

  function onError(err) {
    var code = String((err && err.code) || "");
    var msg = String((err && err.message) || err || "");
    var missing = code === "42P01" || /PGRST20[05]/.test(code) ||
                  /schema cache/i.test(msg) || /does not exist/i.test(msg);
    console.warn("[접수현황] 조회 실패", err);

    if (everOk) {
      // ⛔ 한 번 보여 준 숫자를 지우지 않습니다. 다만 «최신이 아님» 을 정직하게 말합니다.
      setStatus("bad", "잠시 연결이 되지 않습니다 — " +
                       Math.round(POLL_MS / 1000) + "초마다 다시 확인합니다");
      startPoll();
      return;
    }
    if (missing) {
      fail("아직 접수가 시작되지 않았습니다",
           기간글() + " 입니다.\n응답이 들어오기 시작하면 이 화면에 숫자가 나타납니다.");
    } else {
      fail("현황을 불러오지 못했습니다",
           "잠시 뒤 다시 열어 보십시오.\n행정망 안에서는 접속이 막혀 있을 수 있습니다.");
    }
  }

  function fail(t, p) {
    $("main").hidden = true;
    $("noticeT").textContent = t;
    $("noticeP").textContent = p;
    $("notice").hidden = false;
    refreshStatus();
  }

  /* ── 서버 한 줄 → 화면이 쓰는 모양 ────────────────────────────── */
  function normalize(row) {
    var v = { total: 0, today: 0, last_at: null, orgs: null, means: [], avg_n: null };
    if (!row) return v;

    v.total = num(row.total_n) || 0;

    /* ⭐ 자정 넘김은 «화면 몫» 입니다(자물쇠 안내).
       today_date 가 오늘(KST)이 아니면 today_n 은 «어제 것» 이므로 0 으로 봅니다.
       ⛔ 이 처리를 빼면 자정이 지난 뒤에도 어제 건수가 「오늘」로 걸려 있습니다. */
    var td = row.today_date ? String(row.today_date).slice(0, 10) : null;
    v.today = (td && td === seoulDay(new Date())) ? (num(row.today_n) || 0) : 0;

    v.last_at = row.last_at_min || null;      // 분 단위(초는 0)로 이미 뭉개져 옵니다
    v.avg_n = num(row.avg_n);

    // 기관별 — 총 5건 미만이면 서버가 통째로 null 로 줍니다.
    var dc = row.dept_counts;
    if (typeof dc === "string") { try { dc = JSON.parse(dc); } catch (e) { dc = null; } }
    if (Array.isArray(dc)) {
      v.orgs = dc.map(function (x) {
        // ⛔ num() 이 null 을 그대로 null 로 돌려줍니다 — 0 으로 바뀌면 가린 것이 드러납니다.
        return { name: String((x && x.dept) || ""), n: num(x && x.n) };
      });
    }

    // 평균 — 10건 전에는 비어 옵니다. 그때는 «아무것도 그리지 않습니다».
    var av = row.avgs;
    if (typeof av === "string") { try { av = JSON.parse(av); } catch (e) { av = null; } }
    if (Array.isArray(av)) {
      av.forEach(function (o) {
        var k = String((o && (o.key || o.q)) || "");
        var x = num(o && (o.avg !== undefined ? o.avg : o.mean));
        if (k && x !== null) v.means.push({ key: k, avg: x });
      });
    } else if (av && typeof av === "object") {
      MEANS.forEach(function (m) {
        var x = num(av[m.key]);
        if (x !== null) v.means.push({ key: m.key, avg: x });
      });
    }
    return v;
  }

  /* ── 그리기 ───────────────────────────────────────────────────── */
  function paint(v) {
    if (!v) return;
    everOk = true;
    $("notice").hidden = true;
    $("main").hidden = false;
    refreshStatus();

    $("total").textContent = String(v.total);
    var pct = Math.min(100, S.GOAL ? (v.total / S.GOAL) * 100 : 0);
    $("rail").style.width = pct + "%";
    $("pct").textContent = Math.round(pct) + "%";

    $("today").textContent = String(v.today);
    $("last").textContent = v.last_at ? ago(v.last_at) : "–";
    $("lastSub").textContent = v.last_at ? "" : "아직 없습니다";

    var d = daysLeft();
    $("left").textContent = d > 0 ? d + "일" : (d === 0 ? "오늘" : "마감");
    $("leftSub").textContent = d > 0 ? S.기간끝 + "(" + S.마감요일 + ") 까지"
                                     : (d === 0 ? "오늘까지입니다" : "조사가 끝났습니다");

    drawOrgs(v);
    drawMeans(v);
  }

  function drawOrgs(v) {
    var box = $("bars"), hint = $("barsHint");
    clear(box);

    if (!v.orgs || !v.orgs.length) {
      hint.textContent = "기관별 응답 수는 전체 " + S.기관별공개하한 +
                         "건부터 보여 드립니다. (지금 " + v.total + "건)";
      return;
    }

    // 줄 순서는 상수 파일이 정합니다(서버가 주는 순서에 휘둘리지 않게).
    /* 막대 길이의 기준 — 부서별 대상 인원을 표기하지 않으므로(target 전부 0 · 2026-09-15)
       실제로는 «응답이 가장 많은 칸» 이 기준입니다. target 을 다시 채우면 그 값이 기준으로
       되살아나므로 max 에 남겨 둡니다. 최소 1 — 0 으로 나누지 않게. */
    var base = 1, masked = 0;
    S.기관.forEach(function (o) { base = Math.max(base, o.target || 0); });
    v.orgs.forEach(function (o) { if (o.n !== null) base = Math.max(base, o.n); });
    /* ⚠ 가려진 칸(n === null)도 「3건 미만」 길이로 그리므로, 기준이 최소공개건수보다
       작으면 막대가 100% 를 넘습니다. 응답이 아주 적은 초기에 생기는 일입니다. */
    base = Math.max(base, S.최소공개건수);

    S.기관.forEach(function (org, i) {
      var found = null;
      for (var k = 0; k < v.orgs.length; k++) if (v.orgs[k].name === org.name) { found = v.orgs[k]; break; }
      /* 응답이 없는 「그 밖의 부서」는 숨긴다.
         ⛔ !org.target 으로 판정하지 않는다 — target 이 전부 0 이라(2026-09-15) 그 조건은
           응답 0건인 「정식 기관」까지 통째로 숨겨 버린다. 현황/dashboard.js 와 같은 규칙으로
           「목록 마지막 칸」만 본다(deptIndex 가 모르는 소속을 모으는 자리). */
      if (!found && i === S.기관.length - 1) return;

      var n = found ? found.n : 0;                  // 목록에 없으면 0건
      var hide = !!found && n === null;             // ⭐ null = 서버가 「3건 미만」이라 가린 것
      if (hide) masked++;

      var row = el("div", "bar b" + i + (hide ? " masked" : ""));
      row.appendChild(el("b", null, org.name));
      row.appendChild(el("em", null,
        (hide ? S.최소공개건수 + "건 미만" : n + "건") +
        (org.target ? " · 대상 " + org.target + "명" : "")));
      var track = el("div", "track");
      var fill = el("u");
      // 막대 길이도 감춥니다 — 1건과 2건이 길이로 구분되면 가린 뜻이 없습니다.
      fill.style.width = (hide ? (S.최소공개건수 / base) * 100 : (n / base) * 100) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      box.appendChild(row);
    });

    var bits = [];
    if (masked) {
      bits.push("응답이 적은 " + masked + "개 칸은 「" + S.최소공개건수 +
                "건 미만」으로만 알려 드립니다 — 누가 답했는지 짐작되지 않게 하기 위해서입니다.");
    }
    if (S.잠정) bits.push("대상 인원은 잠정치입니다.");
    hint.textContent = bits.join(" ");
  }

  function drawMeans(v) {
    var box = $("means"), note = $("meansNote");
    clear(box);

    /* ⛔ 평균이 없을 때 빈 막대나 0.0 을 그리지 않습니다.
       자물쇠가 «차분 공격» 을 막으려고 10건 전에는 평균을 아예 주지 않습니다. */
    if (!v.means.length) {
      note.textContent = "문항 평균은 응답 10건부터 보여 드립니다. (지금 " + v.total + "건)";
      note.hidden = false;
      return;
    }

    /* ⚠ avg_n 과 total_n 이 다른 것이 «정상» 입니다 —
       평균은 «가장 오래된 5의 배수 개» 로만 계산됩니다(방금 낸 분의 답이 평균 차이로
       드러나지 않게). 팀원이 「숫자가 안 맞는다」고 여기지 않도록 사실대로 적습니다. */
    var 미반영 = (v.avg_n !== null) ? (v.total - v.avg_n) : 0;
    if (미반영 > 0) {
      note.textContent = "평균은 " + v.avg_n + "건으로 계산했습니다 — 최근 " + 미반영 +
                         "건은 아직 평균에 반영되지 않았습니다.";
      note.hidden = false;
    } else {
      note.hidden = true;
    }

    v.means.forEach(function (m) {
      var meta = null;
      for (var i = 0; i < MEANS.length; i++) if (MEANS[i].key === m.key) { meta = MEANS[i]; break; }
      var row = el("div", "mean");
      var label = el("b");
      label.appendChild(el("span", "v", m.avg.toFixed(1)));    // 소수 첫째 자리
      label.appendChild(document.createTextNode(meta ? meta.t : m.key));
      row.appendChild(label);
      var track = el("div", "track");
      [25, 50, 75].forEach(function (p) { var t = el("s"); t.style.left = p + "%"; track.appendChild(t); });
      var fill = el("u");
      fill.style.width = Math.max(0, Math.min(100, (m.avg - 1) / 4 * 100)) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      box.appendChild(row);
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     [적어 주신 의견] 주관식 문22·문23
     ⭐⭐ 집계와 «완전히 따로» 돕니다. 이 함수가 실패해도 위 숫자는 그대로 남습니다.
     ⛔ 본문은 textContent 로만 넣습니다. innerHTML 금지,
        URL 자동링크 금지 — 로그인 없는 공개 화면에서 스크립트·피싱 경로가 됩니다.
     ⛔ 「새 의견 도착」 배지·하이라이트·토스트를 넣지 마십시오.
        현황/ 화면의 NEW 칩을 흉내내면 안 됩니다 — 그쪽은 로그인 화면입니다.
     ══════════════════════════════════════════════════════════════════ */
  function loadOpinions() {
    if (!sb || opBusy) return;
    opBusy = true;
    // ⛔ survey_responses 가 아닙니다. anon 에 열린 주관식 표는 여기 하나뿐입니다.
    sb.from(OPINIONS).select("pub_key,qno,ord,body").order("ord", { ascending: true })
      .then(function (res) {
        opBusy = false;
        if (res.error) { onOpinionError(res.error); return; }
        opEverOk = true;
        drawOpinions(res.data || []);
      })
      .catch(function (e) { opBusy = false; onOpinionError(e); });
  }

  /* 표가 아직 없거나(양호창님이 SQL 을 실행하기 전) 조회가 실패했을 때.
     ⭐ 첫 배포 직후의 «실제» 상태가 이것입니다 — 반쯤 만들어진 자리를 보이지 않고 조용히 숨깁니다.
     ⭐ 한 번이라도 보여 준 뒤라면 지우지 않습니다. 연결이 이상하다는 말은 머리의 알림이 이미 합니다. */
  function onOpinionError(err) {
    console.warn("[접수현황] 주관식을 불러오지 못했습니다", err);
    if (opEverOk) return;
    $("opCard").hidden = true;
  }

  function drawOpinions(rows) {
    var card = $("opCard"), box = $("opBody"), note = $("opNote");

    /* 걸러내기 + 문항별로 나누기. ord 순서는 서버가 준 대로 씁니다(제출순이 아닙니다). */
    var bucket = { 22: [], 23: [] };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || {};
      var body = (r.body === null || r.body === undefined) ? "" : String(r.body);
      if (!HAS_LETTER.test(body)) continue;              // 글자 없는 답변은 싣지 않습니다
      var q = num(r.qno);
      if (q !== 22 && q !== 23) continue;                // 모르는 문항은 그리지 않습니다
      bucket[q].push({
        key: String(r.pub_key || (q + "#" + i)),
        body: body
      });
    }

    clear(box);
    var n22 = bucket[22].length, n23 = bucket[23].length;
    $("opCount").textContent = "문22 " + n22 + "건 · 문23 " + n23 + "건";
    card.hidden = false;

    if (!n22 && !n23) {
      note.textContent = "아직 적어 주신 의견이 없습니다. 짧게 한 줄이어도 큰 도움이 됩니다.";
      note.hidden = false;
      return;
    }
    note.hidden = true;

    OPQ.forEach(function (q) {
      var list = bucket[q.qno];
      if (!list.length) return;                          // 빈 묶음은 제목도 만들지 않습니다
      var grp = el("div", "opgrp");
      var h = el("h3", null, q.t);
      h.appendChild(el("span", "c", list.length + "건"));
      grp.appendChild(h);
      var ul = el("div", "oplist");
      list.forEach(function (o) { ul.appendChild(opCard(o)); });
      grp.appendChild(ul);
      box.appendChild(grp);
    });

    applyClamps();
  }

  function opCard(o) {
    var text = o.body;
    var len = text.replace(/\s+/g, " ").trim().length;
    var card = el("article", "op" + (len <= 10 ? " short" : ""));
    // ⛔ [검수 2026-09-15] pub_key 를 data-* 속성으로 두면 view-source/outerHTML 에
    //    그대로 찍혀 「DOM 에 사람이 읽을 수 있게」 나옵니다 — 일반 프로퍼티로만 둡니다.
    card.opKey = o.key;

    var p = el("p", "op-body", text);                    // ⭐ textContent — el() 이 그렇게 넣습니다
    card.appendChild(p);

    var btn = el("button", "op-more", "더 보기");
    btn.type = "button";
    btn.hidden = true;                                   // 접을 만큼 길 때만 켭니다(applyClamps)
    btn.addEventListener("click", function () {
      var k = card.opKey;
      opOpen[k] = !opOpen[k];
      applyOne(card);
    });
    card.appendChild(btn);

    var lenP = el("p", "op-len", "이 답변 " + len + "자");
    lenP.hidden = true;
    card.appendChild(lenP);
    return card;
  }

  /* 접기 판정 — «글자 수로 어림잡지 않고» 실제로 넘쳤는지 봅니다.
     4줄(359px 아래 5줄)은 CSS 가 정하므로, 폭이 달라지면 판정도 저절로 달라집니다. */
  function applyOne(card) {
    var p = card.querySelector(".op-body");
    var btn = card.querySelector(".op-more");
    var lenP = card.querySelector(".op-len");
    if (!p || !btn) return;
    var open = !!opOpen[card.opKey];

    p.classList.add("clip");
    var over = p.scrollHeight > p.clientHeight + 2;
    if (!over) {                                         // 4줄 안에 들어오는 답 — 단추가 필요 없습니다
      p.classList.remove("clip");
      btn.hidden = true;
      if (lenP) lenP.hidden = true;
      return;
    }
    btn.hidden = false;
    if (lenP) lenP.hidden = false;
    if (open) p.classList.remove("clip");
    btn.textContent = open ? "접기" : "더 보기";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function applyClamps() {
    var cards = $("opBody").querySelectorAll(".op");
    for (var i = 0; i < cards.length; i++) applyOne(cards[i]);
  }

  boot();

  /* 가로로 돌리거나 창을 줄이면 «몇 줄인지» 가 달라집니다 — 판정을 다시 합니다.
     ⭐ 다시 그리지 않으므로 펼쳐 둔 답변과 스크롤 위치가 그대로 남습니다. */
  window.addEventListener("resize", function () {
    clearTimeout(opResizeTimer);
    opResizeTimer = setTimeout(function () {
      if (!$("opCard").hidden) applyClamps();
    }, 200);
  });
})();

# PROMPT BUDGET 2026-09-22 — 작성 프롬프트 예산 인벤토리

측정 도구: `scripts/prompt-budget-report.cjs <C-final-prompt.txt> [--all] [--json]` (plain node, Electron 불필요)
측정 대상 (라이브 실행본):
- SEO: `%APPDATA%\better-life-naver\generation-runs\20260922-101803-hx0pej\C-final-prompt.txt` (청약통장 금리, attempt 2 = QualityGate 재시도 프롬프트)
- 홈판: `%APPDATA%\better-life-naver\generation-runs\20260922-104940-neiyts\C-final-prompt.txt` (변우석 텐텐, attempt 2 = 제목 약속 미이행 재시도 프롬프트)

토큰 추정 = chars / 1.7. "instruction" 정의는 `src/contentGenerator.ts:6778` (`systemPrompt.length - source.rawText.length`)과 동일 — 설계도(설계도·당사자 발언·핵심 사실)는 rawText 밖이므로 instruction 으로 잡힌다. 표에서는 SOURCE_MATERIAL(derived) 로 따로 표기했다.

핵심 수치

| | SEO (청약통장) | 홈판 (변우석) |
|---|---|---|
| 전체 | 81,642 chars (~48.0K tok) | 53,652 chars (~31.6K tok) |
| 원문 자료 [자료 Sxx] | 18,591 | 5,377 |
| 설계도(derived) | 2,655 | 2,240 |
| instruction (meta 정의) | 63,051 (~37.1K tok) | 48,275 (~28.4K tok) |
| instruction : 원문 | **3.39 : 1** | **8.98 : 1** |
| system 파트 / user 파트 | 51,185 / 30,457 | 36,689 / 16,963 |
| user 파트 안의 지시문 | 11,866 | 11,586 |
| 목표 | ≤3:1 → instruction ≤55.8K (−7.3K) | ≤4:1 → instruction ≤21.5K (−26.8K) |

홈판 4:1 은 지시문 절감만으로는 닿지 않는다(§8 참조). 이 실행은 8개 자료 중 6개를 거부해(meta `sourceRetention: accepted 2 / rejected 6`, rawChars 17,211 → 전달 5,377) 분모가 3분의 1로 줄었다. 자료 보존이 같은 크기의 레버다.

---

## 1. 블록 표 (스크립트 출력)

### 1-A. SEO — `node scripts/prompt-budget-report.cjs …\20260922-101803-hx0pej\C-final-prompt.txt`

```
total chars 81,642 | lines 1,889 | ~tokens 48,025

  # part   block                                                             chars    ~tok  %instr  tag
  1 system (preamble)                                                           59      35    0.1%  OTHER  (L1-1)
  2 system [BLOGGER IDENTITY CORE] — 이 블로거의 언어 DNA (인용 금지, 내면화만)    1,334     785    2.1%  STYLE_RULES  (L2-40)
  3 system [MODE VOICE: SEO 검색 최적화]                                       730     429    1.2%  STYLE_RULES  (L41-69)
  4 system [STYLE OVERRIDE: 친근한 톤]                                       2,123   1,249    3.4%  STYLE_RULES  (L70-103)
  5 system [SECTION -2] LLM 충실도 강제 (Faithfulness Gate — 2026-05 신규)    1,680     988    2.7%  CORE_FACT_RULES  (L104-142)
  6 system [SECTION -1] 검색 의도 분석 (모든 글의 출발점 — 2026.05 신규)       645     379    1.0%  SEO_RULES  (L143-164)
  7 system [SECTION 0] 절대 규칙 TOP 10 (위반 시 전체 폐기) 🚨                2,135   1,256    3.4%  SEO_RULES  (L165-208)
  8 system [SECTION 1] Anti-Hallucination 마스터 규칙 (가장 중요)            2,182   1,284    3.5%  CORE_FACT_RULES  (L209-278)
  9 system [SECTION 3] 통합랭킹 전략 — 롱테일 수직 파고들기                    507     298    0.8%  SEO_RULES  (L279-298)
 10 system [SECTION 4] AI 브리핑 + AI 탭 답변블록 대응 (상위 노출 절반)        850     500    1.3%  SEO_RULES  (L299-325)
 11 system [SECTION 5] 도입부 설계 (1.5초 뒤로가기 방지)                       812     478    1.3%  RETENTION_RULES  (L326-352)
 12 system [SECTION 6] 본문 구조 + 소제목 원칙                                 689     405    1.1%  NAVER_RULES  (L353-377)
 13 system [모바일 우선 작성 강제 — 2026-05 신규] mobile-first writing         774     455    1.2%  NAVER_RULES  (L378-403)
 14 system [SECTION 7] 키워드 배치 + 의미론적 SEO                              277     163    0.4%  SEO_RULES  (L404-417)
 15 system [SECTION 8] 결론부 — 검색 종결 신호 설계                          1,080     635    1.7%  CTA_RULES  (L418-451)
 16 system [SECTION 9] AI 탐지 회피 — 진짜 사람 글의 디지털 지문             1,796   1,056    2.8%  PROHIBITIONS  (L452-504)
 17 system [SECTION 10] 어미 다양화 + 톤 적용                                  978     575    1.6%  STYLE_RULES  (L505-530)
 18 system [SECTION 11] 제목 설계 + 쇼핑커넥트 특화                          1,260     741    2.0%  TITLE_RULES  (L531-571)
 19 system [SECTION 12] 서식 + 모바일 UX + 플레이스홀더                      1,145     674    1.8%  NAVER_RULES  (L572-612)
 20 system [SECTION 14] FINAL SELF-CORRECTION WALL                             526     309    0.8%  OUTPUT_FORMAT  (L613-630)
 21 system [노출·인용 구조 — 기본 적용 / 정보성] — 2026-06 (경량 핵심)       1,821   1,071    2.9%  SEO_RULES  (L631-671)
 22 system [상황-공감 깊이 — 도입부 보강] — 2026-06                            783     461    1.2%  RETENTION_RULES  (L672-694)
 23 system [OFFICIAL NAVER EXPOSURE PRIORITY OVERRIDE - 2026]                2,510   1,476    4.0%  NAVER_RULES  (L695-746)
 24 system SEO 90+ QUALITY CONTRACT                                            881     518    1.4%  SEO_RULES  (L747-763)
 25 system [HEADINGS: SEO] 소제목 = 검색자 하위 질의의 색인                  1,695     997    2.7%  SEO_RULES  (L764-807)
 26 system [BRIEF-HEAD] 글의 첫 화면 = 사실 요약 표 + 날짜 앵커              1,704   1,002    2.7%  SEO_RULES  (L808-854)
 27 system [HASHTAG] 해시태그 = 버리는 자리가 아니다                           918     540    1.5%  SEO_RULES  (L855-884)
 28 system [ANGLE] 같은 사실을 세 각도로 통과시킨다                          1,071     630    1.7%  STYLE_RULES  (L885-917)
 29 system [HUMAN WRITING ANTI-PATTERN CONTRACT]                             3,510   2,065    5.6%  STYLE_RULES  (L918-996)
 30 system [STYLE OVERRIDE: 친근한 톤] #2                                    1,683     990    2.7%  STYLE_RULES  (L997-1021)
 31 system [원본 제목 활용 지침]                                               265     156    0.4%  TITLE_RULES  (L1022-1027)
 32 system [GEO/AEO OVERLAY] 외부 LLM 인용 친화 패치 (사용자 명시 ON)        3,683   2,166    5.8%  SEO_RULES  (L1028-1154)
 33 system 팩트 규율 — 자료를 잘못 조립하는 일곱 가지 (위반 시 그 문장 삭제)    1,804   1,061    2.9%  CORE_FACT_RULES  (L1155-1203)
 34 system [출력 형식 — 반드시 이 순서와 JSON 형식으로]                         50      29    0.1%  OUTPUT_FORMAT  (L1204-1205)
 35 system [SEO 모드 필수 규칙] ⚠️⚠️⚠️                                         245     144    0.4%  OUTPUT_FORMAT  (L1206-1210)
 36 system [SEO 제목 생성 가이드 — 상황 기준]                                  571     336    0.9%  TITLE_RULES  (L1211-1224)
 37 system [모든 모드 공통: 표/체크리스트/그래프성 블록 규칙]                  599     352    1.0%  OUTPUT_FORMAT  (L1225-1237)
 38 system { JSON output schema }                                            3,031   1,783    4.8%  OUTPUT_FORMAT  (L1238-1279)
 39 system [모든 모드 — 제목보다 추론이 먼저다]                              1,615     950    2.6%  OUTPUT_FORMAT  (L1280-1306)
 40 system [근거 인용 — 모든 모드 공통 · 가장 중요]                            376     221    0.6%  OUTPUT_FORMAT  (L1307-1314)
 41 system [소제목 스타일 — 모든 모드 공통] headings[].title은 30자 이내.      162      95    0.3%  OUTPUT_FORMAT  (L1315-1318)
 42 system [이미지 프롬프트 작성 규칙 - 매우 중요!]                            626     368    1.0%  OUTPUT_FORMAT  (L1319-1333)
 43 user   [원본 텍스트]                                                         8       5    0.0%  OUTPUT_FORMAT  (L1334-1334)
 44 user   [설계도 — 이 글은 아래 재료로 쓴다]                                 785     462    1.2%  SOURCE_MATERIAL  (L1335-1342)
 45 user   [당사자 발언 — …]                                                   401     236    0.6%  SOURCE_MATERIAL  (L1343-1348)
 46 user   [핵심 사실 — …]                                                   1,469     864    2.3%  SOURCE_MATERIAL  (L1349-1360)
 47 user   [VOICE PROFILE — 이 글만의 목소리 (매 글 달라짐)]                   489     288    0.8%  STYLE_RULES  (L1361-1369)
 48 user   [필수 키워드 정보 — 제목/소제목 작성에 반드시 반영]                 272     160    0.4%  TITLE_RULES  (L1370-1379)
 49 user   [SEO 모드 제목 필수 조건]                                           223     131    0.4%  TITLE_RULES  (L1380-1389)
 50 user   [참고 지표] 월간검색량 460건 / 문서량 206,260건 → 블루오션…         421     248    0.7%  OTHER  (L1390-1396)
 51 user   📄 [원본 본문]  (S01 2,213 · S02 2,701 · S07 2,494 · S08 2,688 · S03 2,075 · S04 2,142 · S05 2,027 · S06 2,251)
                                                                            18,598  10,940       -  SOURCE_MATERIAL  (L1397-1712)
 52 user   [최종 강제 조건 — 위반 시 0점]                                    1,268     746    2.0%  OUTPUT_FORMAT  (L1713-1740)
 53 user   [SITUATION DEPTH — 검색자의 상황을 해결하는 글]                     921     542    1.5%  RETENTION_RULES  (L1741-1768)
 54 user   [TITLE — 상황·경험 기준 (2026)]                                   2,078   1,222    3.3%  TITLE_RULES  (L1769-1821)
 55 user   [EVIDENCE AND INTENT FINAL CONTRACT]                              1,233     725    2.0%  CORE_FACT_RULES  (L1822-1836)
 56 user   [1회 완성 품질 계약: balanced]                                      881     518    1.4%  OUTPUT_FORMAT  (L1837-1856)
 57 user   [RUNTIME RETRY AND CONTEXT INSTRUCTIONS]                             40      24    0.1%  OTHER  (L1857-1857)
 58 user   [QualityGate 90+ 목표 / 발행 하한 보정 — seo 모드]                1,002     589    1.6%  OTHER  (L1858-1880)
 59 user   [Quality Gate — 재생성 지시 (seo 모드)]                             310     182    0.5%  OTHER  (L1881-1889)

── totals by tag ──
  SOURCE_MATERIAL      21,253 chars   12,502 tok        - of instruction
  SEO_RULES            15,116 chars    8,892 tok    24.0% of instruction
  STYLE_RULES          11,918 chars    7,011 tok    18.9% of instruction
  OUTPUT_FORMAT         9,387 chars    5,522 tok    14.9% of instruction
  CORE_FACT_RULES       6,899 chars    4,058 tok    10.9% of instruction
  NAVER_RULES           5,118 chars    3,011 tok     8.1% of instruction
  TITLE_RULES           4,669 chars    2,746 tok     7.4% of instruction
  RETENTION_RULES       2,516 chars    1,480 tok     4.0% of instruction
  OTHER                 1,832 chars    1,078 tok     2.9% of instruction
  PROHIBITIONS          1,796 chars    1,056 tok     2.8% of instruction
  CTA_RULES             1,080 chars      635 tok     1.7% of instruction

── instruction vs source ──
  raw source docs ([자료 Sxx])          : 18,591 chars (~10,936 tok)
  blueprint/derived (설계도·발언·사실) : 2,655 chars
  instruction (total − raw source)     : 63,051 chars (~37,089 tok)
  instruction excluding blueprint      : 60,396 chars
  ratio instruction : raw source       = 3.39 : 1
  ratio instr(ex-blueprint) : source+bp = 2.84 : 1
  system part (before [원본 텍스트])    : 51,185 chars | user part: 30,457 chars (instruction inside user part: 11,866)
```

<details><summary>SEO — 40 longest lines</summary>

```
  L1711   2,017 [SRC] 정부가 이달 말 종료예정이던 입주자저축(청약 예·부금, 청약저축)의 주택청약종합저축 전환 기한을 1년 추가로…
  L1408   1,439 [SRC] [서울경제TV=정창신기자] 서울에서 아파트 전세를 구하려면 평균 6억3082만원이 필요하다…
  L1688   1,418 [SRC] 제공=리얼하우스지역별로는 수도권 3개 시·도 모두 전월 대비 동반 약세를 나타냈다…
  L1437   1,220 [SRC] 국토교통부에 따르면 공공임대는 취약계층 중심에서 다양한 계층으로 대상을 넓힌다…
  L1699     969 [SRC] 예비 청약자들이 서울 양천구 목동 '목동윤슬자이' 견본주택을 둘러보고 있다…
  L1700     796 [SRC] 그래픽=정서희 강남권 고급 주거용 오피스텔에서도 거래가 나왔다…
  L1436     714 [SRC] 이재명 정부가 공공주도 주택공급에 승부수를 던졌다…
  L1438     519 [SRC] 전문가들은 이번 대책이 공공주도 주택공급이라는 정책 기조를 구체화했다는 점에 의미를 뒀다…
  L1687     462 [SRC] 서울시의 한 견본주택을 찾은 시민들이 아파트 단지 모형을 살펴보고 있다…
  L85       367 [INS] ■ 페르소나: 친한 친구나 다정한 언니/오빠가 옆에서 차분히 알려주는 느낌…
  L1012     367 [INS] ■ 페르소나: 친한 친구나 다정한 언니/오빠가 옆에서 차분히 알려주는 느낌…   ← L85 와 동일 문장
  L1492     352 [SRC] 세제 혜택은 향후 세법 개정에 따라 변동될 가능성이 있습니다…
  L1271     298 [INS] {"label": "이 글 주제와 직접 상관있는 축만 (자료에 있다고 다 넣지 않는다…
  L1242     254 [INS] "whyNow": "이 키워드가 지금 검색·소비되는 이유를 입력 단서에서 추론…
  L1395     246 [SRC] ※ 아래 [자료 Sxx] 번호표는 내부 식별자다… 실제 출처 귀속은 **적극적으로 써라**…
  L1263     231 [INS] "finalVerdict": "제목이 던진 질문(독자 상황)에 대한 필자의 판단 1~2문장…
  L1490     214 [SRC] 단순한 예금 상품과 달리 청약 당첨 시 청년 주택드림 디딤돌 대출과 연계됩니다…
  L1341     206 [INS] - 본문에서 뺄 주제(자료에 있어도 이 글의 질문이 아니다): 서울 아파트·오피스텔 전세가격…
  L1486     206 [SRC] 가입 자격은 만 19세에서 34세 이하의 무주택자를 대상으로 합니다…
  L1358     205 [INS] 9. 2024년 11월부터 월 인정 납입금액 한도가 10만원에서 25만원으로 상향됐고…
  L1860     194 [INS] 미달 항목: modeScore 82<90, finalScore 72<90, publication finalScore 72<80…
  L1488     182 [SRC] 이 상품의 핵심은 최대 연 4.5%에 달하는 금리입니다…
  L1241     177 [INS] "entityCheck": "키워드 속 고유명사 판별 — 작품명·인물명·브랜드를 크롤링 자료와 대조…
  L1352     175 [INS] 3. 종합저축으로 전환하면 기존 입주자저축보다 높은 금리와 소득공제…
  L1826     174 [INS] - 자료의 존재·부족·범위를 독자에게 말하지 않는다. "제공된 문구", "현재 자료에는"…
  L1265     169 [INS] {"title": "소제목 1", "content": "본문 내용...", "summary": "요약"…
  L1502     169 [SRC] 2024년 11월부터 주택청약종합저축의 월 인정 납입금액 한도가…
  L1350     165 [INS] 1. 국토부가 2024년 9월 청약통장 금리를 인상하면서…
  L1827     162 [INS] - [2026-09-03 라이브 224399815476] 자료 목록 자체를 서술하지 않는다…
  L1339     154 [INS] - 소제목 후보(각각 다른 질문 축, 순서·표현은 다듬어도 된다): 청약통장 금리, 지금 몇 %인가…
  L304      153 [INS] [첫 문장 패턴 — 예시(강제 아님)] ⚠️ 매 H2를 같은 템플릿으로 시작하면 균질해져…
  L1354     150 [INS] 5. 청년 주택드림 청약통장은 기본금리에 우대금리 1.7%p를 더해…
  L1484     150 [SRC] 2026년 9월 현재 청년층의 주거 안정을 위한 정부 지원 정책은…
  L1359     147 [INS] 10. 올해 7월 기준 청약통장 적립액 8조4000억원 중 8조2000억원이 해지돼…
  L1448     146 [SRC] 2026년 9월 현재 청년층의 주거 안정을 위한 정부 지원 정책은…
  L1838     142 [INS] 아래 규칙은 초안을 다시 호출하지 않고 첫 응답을 바로 쓸 수 있게 만드는 최종 작성 절차다…
  L87       139 [INS] ■ 금지: ~하십시오 등 과한 격식체, ~합니다/~입니다만 연속되는 보고서체…
  L1014     139 [INS] ■ 금지: ~하십시오 등 과한 격식체…   ← L87 과 동일 문장
  L1657     136 [SRC] 청년월세 소득 기준 100%로 완화정부가 2030년까지…
  L1282     135 [INS] - whyNow 는 주어진 단서(뉴스 시점·상위글 반복 지점·지식iN 질문·검색량 지표)를 실제로 훑어…
```
</details>

### 1-B. 홈판 — `node scripts/prompt-budget-report.cjs …\20260922-104940-neiyts\C-final-prompt.txt`

```
total chars 53,652 | lines 1,463 | ~tokens 31,560

  # part   block                                                             chars    ~tok  %instr  tag
  1 system (preamble)                                                           59      35    0.1%  OTHER  (L1-1)
  2 system [BLOGGER IDENTITY CORE] — 이 블로거의 언어 DNA (인용 금지, 내면화만)    1,333     784    2.8%  STYLE_RULES  (L2-39)
  3 system [홈판 제목 제약] — 상황·경험 기준 계약의 보조 규칙                1,237     728    2.6%  HOMEFEED_RULES  (L40-78)
  4 system [MODE VOICE: 홈판 이웃 피드 노출]                                 1,063     625    2.2%  STYLE_RULES  (L79-112)
  5 system [STYLE OVERRIDE: 친근한 톤]                                       1,965   1,156    4.1%  STYLE_RULES  (L113-143)
  6 system [HOMEFEED BASE PROMPT - EVIDENCE FIRST]                             156      92    0.3%  HOMEFEED_RULES  (L144-148)
  7 system [SECTION -2] LLM 충실도 강제                                        595     350    1.2%  CORE_FACT_RULES  (L149-169)
  8 system [GAMMA-7] 내 얘기 같은 첫 화면                                      738     434    1.5%  HOMEFEED_RULES  (L170-195)
  9 system [ANGLE] 소재를 어느 각도로 잡을 것인가                              622     366    1.3%  HOMEFEED_RULES  (L196-215)
 10 system [TITLE] 제목                                                      2,330   1,371    4.8%  HOMEFEED_RULES  (L216-268)
 11 system [STRUCTURE] 본문 흐름                                               737     434    1.5%  HOMEFEED_RULES  (L269-300)
 12 system [HUMAN WRITING] 진짜 사람 디지털 지문                             1,584     932    3.3%  STYLE_RULES  (L301-343)
 13 system [MOBILE] 모바일 읽기                                                323     190    0.7%  HOMEFEED_RULES  (L344-353)
 14 system [RETENTION] 저장할 이유와 댓글 달 거리                              460     271    1.0%  HOMEFEED_RULES  (L354-369)
 15 system [FINAL CHECK]                                                       563     331    1.2%  OUTPUT_FORMAT  (L370-388)
 16 system [상황-공감 깊이 — 도입부 보강] — 2026-06                            783     461    1.6%  RETENTION_RULES  (L389-411)
 17 system [OFFICIAL NAVER EXPOSURE PRIORITY OVERRIDE - 2026]                2,510   1,476    5.2%  NAVER_RULES  (L412-463)
 18 system HOMEFEED 90+ QUALITY CONTRACT                                     1,236     727    2.6%  HOMEFEED_RULES  (L464-498)
 19 system [HEADINGS: 홈판] 소제목 = 검색어 없이 들어온 독자를 붙잡는 흐름 표지    1,184     696    2.5%  HOMEFEED_RULES  (L499-532)
 20 system [HASHTAG] 해시태그 = 버리는 자리가 아니다                           918     540    1.9%  SEO_RULES  (L533-562)
 21 system [ANGLE] 같은 사실을 세 각도로 통과시킨다                          1,071     630    2.2%  STYLE_RULES  (L563-595)
 22 system [HUMAN WRITING ANTI-PATTERN CONTRACT]                             3,510   2,065    7.3%  STYLE_RULES  (L596-674)
 23 system [STYLE OVERRIDE: 친근한 톤] #2                                    1,684     991    3.5%  STYLE_RULES  (L675-700)
 24 system [홈판 상위노출 본문 원칙 - 근거 우선, 주제별 적용]                  905     532    1.9%  HOMEFEED_RULES  (L701-714)
 25 system [원본 제목 활용 지침]                                               265     156    0.5%  TITLE_RULES  (L715-720)
 26 system [검증된 노출 성공 제목 — 내 글 중 실제로 통합탭/홈판 상위 노출된 제목…]   306     180    0.6%  TITLE_RULES  (L721-729)
 27 system 팩트 규율 — 자료를 잘못 조립하는 일곱 가지 (위반 시 그 문장 삭제)    1,804   1,061    3.7%  CORE_FACT_RULES  (L730-778)
 28 system [출력 형식 — 반드시 이 순서와 JSON 형식으로]                         50      29    0.1%  OUTPUT_FORMAT  (L779-780)
 29 system [홈판 모드 필수 구조 규칙] ⚠️⚠️⚠️                                   615     362    1.3%  OUTPUT_FORMAT  (L781-789)
 30 system [모든 모드 공통: 표/체크리스트/그래프성 블록 규칙]                  599     352    1.2%  OUTPUT_FORMAT  (L790-802)
 31 system { JSON output schema }                                            2,756   1,621    5.7%  OUTPUT_FORMAT  (L803-839)
 32 system [모든 모드 — 제목보다 추론이 먼저다]                              1,564     920    3.2%  OUTPUT_FORMAT  (L840-864)
 33 system [근거 인용 — 모든 모드 공통 · 가장 중요]                            376     221    0.8%  OUTPUT_FORMAT  (L865-872)
 34 system [소제목 스타일 — 모든 모드 공통] headings[].title은 30자 이내.      162      95    0.3%  OUTPUT_FORMAT  (L873-876)
 35 system [이미지 프롬프트 작성 규칙 - 매우 중요!]                            626     368    1.3%  OUTPUT_FORMAT  (L877-891)
 36 user   [원본 텍스트]                                                         8       5    0.0%  OUTPUT_FORMAT  (L892-892)
 37 user   [설계도 — 이 글은 아래 재료로 쓴다]                                 739     435    1.5%  SOURCE_MATERIAL  (L893-900)
 38 user   [당사자 발언 — …]                                                   386     227    0.8%  SOURCE_MATERIAL  (L901-906)
 39 user   [핵심 사실 — …]                                                   1,115     656    2.3%  SOURCE_MATERIAL  (L907-919)
 40 user   [STRUCTURE OVERRIDE — 이번 글의 구조 힌트] 🎲                        980     576    2.0%  OUTPUT_FORMAT  (L920-944)
 41 user   [VOICE PROFILE — 이 글만의 목소리 (매 글 달라짐)]                   520     306    1.1%  STYLE_RULES  (L945-954)
 42 user   [필수 키워드 정보 — 제목/소제목 작성에 반드시 반영]                 274     161    0.6%  TITLE_RULES  (L955-967)
 43 user   [홈판 모드 제목 필수 조건]                                          365     215    0.8%  HOMEFEED_RULES  (L968-978)
 44 user   [참고 지표] 월간검색량 1,050건 / 문서량 211건 → 블루오션…           419     246    0.9%  OTHER  (L979-985)
 45 user   📄 [원본 본문]  (S07 · S08 — 8건 중 2건만 수용)                   5,378   3,164       -  SOURCE_MATERIAL  (L986-1313)
 46 user   [최종 강제 조건 — 위반 시 0점]                                    1,268     746    2.6%  OUTPUT_FORMAT  (L1314-1341)
 47 user   [SITUATION DEPTH — 검색자의 상황을 해결하는 글]                     921     542    1.9%  RETENTION_RULES  (L1342-1369)
 48 user   [TITLE — 상황·경험 기준 (2026)]                                   2,027   1,192    4.2%  TITLE_RULES  (L1370-1422)
 49 user   [EVIDENCE AND INTENT FINAL CONTRACT]                              1,291     759    2.7%  CORE_FACT_RULES  (L1423-1437)
 50 user   [1회 완성 품질 계약: balanced]                                      881     518    1.8%  OUTPUT_FORMAT  (L1438-1457)
 51 user   [RUNTIME RETRY AND CONTEXT INSTRUCTIONS]                             40      24    0.1%  OTHER  (L1458-1458)
 52 user   [제목 약속 미이행 — 반드시 고칠 것]                                 300     176    0.6%  OTHER  (L1459-1463)

── totals by tag ──
  STYLE_RULES          12,730 chars    7,488 tok    26.4% of instruction
  OUTPUT_FORMAT        10,448 chars    6,146 tok    21.6% of instruction
  HOMEFEED_RULES       10,293 chars    6,055 tok    21.3% of instruction
  SOURCE_MATERIAL       7,618 chars    4,481 tok        - of instruction
  CORE_FACT_RULES       3,690 chars    2,171 tok     7.6% of instruction
  TITLE_RULES           2,872 chars    1,689 tok     5.9% of instruction
  NAVER_RULES           2,510 chars    1,476 tok     5.2% of instruction
  RETENTION_RULES       1,704 chars    1,002 tok     3.5% of instruction
  SEO_RULES               918 chars      540 tok     1.9% of instruction
  OTHER                   818 chars      481 tok     1.7% of instruction

── instruction vs source ──
  raw source docs ([자료 Sxx])          : 5,377 chars (~3,163 tok)
  blueprint/derived (설계도·발언·사실) : 2,240 chars
  instruction (total − raw source)     : 48,275 chars (~28,397 tok)
  instruction excluding blueprint      : 46,035 chars
  ratio instruction : raw source       = 8.98 : 1
  ratio instr(ex-blueprint) : source+bp = 6.04 : 1
  system part (before [원본 텍스트])    : 36,689 chars | user part: 16,963 chars (instruction inside user part: 11,586)
```

<details><summary>홈판 — 40 longest lines</summary>

```
  L128      367 [INS] ■ 페르소나: 친한 친구나 다정한 언니/오빠가 옆에서 차분히 알려주는 느낌…
  L690      367 [INS] ■ 페르소나: (L128 동일)
  L807      254 [INS] "whyNow": "이 키워드가 지금 검색·소비되는 이유를 입력 단서에서 추론…
  L984      246 [SRC] ※ 아래 [자료 Sxx] 번호표는 내부 식별자다… 실제 출처 귀속은 **적극적으로 써라**…
  L828      231 [INS] "finalVerdict": "제목이 던진 질문(독자 상황)에 대한 필자의 판단 1~2문장…
  L933      200 [INS] 소제목1: 가장 강한 사실로 시작해 해석, 반응, 의견을 연결 / 소제목2: …
  L1228     194 [SRC] 190cm가 넘는 변우석과 마틴이 어릴 때 텐텐을 그렇게 먹었다니…
  L817      192 [INS] "surprisingFact": "자료에서 가장 의외인 지점 1문장…
  L806      177 [INS] "entityCheck": "키워드 속 고유명사 판별…
  L1427     174 [INS] - 자료의 존재·부족·범위를 독자에게 말하지 않는다…
  L1310     171 [SRC] 변우석의 키 크는 비결로 텐텐 이야기를 봤는데…
  L830      169 [INS] {"title": "소제목 1", "content": "본문 내용..."…
  L899      167 [INS] - 본문에서 뺄 주제(자료에 있어도 이 글의 질문이 아니다): 설화수 뉴욕 셰프…
  L1428     162 [INS] - [2026-09-03 라이브 224399815476] 자료 목록 자체를 서술하지 않는다…
  L897      149 [INS] - 소제목 후보(각각 다른 질문 축…): 텐텐 먹으면 키 크나요 / …
  L1234     149 [SRC] 미니텐텐맛츄정과 텐텐맛 멀티비타민은 설탕 물엿을 기본으로…
  L909      142 [INS] 2. 텐텐 발언이 나온 곳은 2024년 6월 19일 공개된 하퍼스바자 코리아 유튜브 영상이다…
  L1439     142 [INS] 아래 규칙은 초안을 다시 호출하지 않고 첫 응답을 바로 쓸 수 있게 만드는 최종 작성 절차다…
  L1284     141 [SRC] "'이걸 먹으면 키가 큰다'는 제품으로 접근하기보다는…
  L1302     141 [SRC] 변우석 텐텐은 큰 키의 비결 하나로 보기보다…
  L1264     140 [SRC] "키는 유전적인 요인을 비롯해서 수면, 식사, 운동…
  L130      139 [INS] ■ 금지: ~하십시오 등 과한 격식체…
  L692      139 [INS] ■ 금지: (L130 동일)
  L842      135 [INS] - whyNow 는 주어진 단서(뉴스 시점·상위글 반복 지점…)를 실제로 훑어…
  L898      131 [INS] - 소제목 배정: 각 소제목은 아래 사실·인용 중 **서로 다른 것을 최소 하나씩** 맡는다…
  L1434     131 [INS] - 제목이 던진 질문·숫자·정체·방법은 본문에서 직접 답한다…
  L1425     130 [INS] - 사용자 직접 경험 메모가 없으므로 작성자가 써봤다·가봤다…
  L831      127 [INS] {"title": "소제목 2"…
  L896      127 [INS] - 독자 상황(도입부 첫 문장은 이 장면에서 시작한다): 190cm 변우석이…
  L832      126 [INS] {"title": "소제목 3"…
  L123      125 [INS] - casual/text_hip/community_fan처럼 가벼운 톤도 반말·~임/~함이 아니라…
  L685      125 [INS] (L123 동일)
  L787      122 [INS] - conclusion: 도입이 던진 질문을 finalVerdict 의 판단으로 매듭짓고…
  L708      117 [INS] 3-1. 문단을 명사형으로 끊어도 된다. 실측 기준 홈판 문단의 42%가…
  L908      117 [INS] 1. 변우석은 키 비결 질문에 텐텐보다 유전을 먼저 답했다…
  L914      115 [INS] 7. 생리 관련 주의사항은 텐텐 고유가 아니라…
  L711      113 [INS] 6. 구체 팩트·숫자·고유명사는 입력 자료와 정확히 일치할 때만 사용한다…
  L782      113 [INS] - introduction: 2~4개의 짧은 문장. 제목이 던진 질문에 먼저 답하고…
  L902      113 [INS] 1. "어렸을 때 김치를 많이 먹었다. 생각해 보니까 우유도…
  L1429     113 [INS] - 남의 글을 중계하지 않는다: "후기에서는", "~라는 후기도 있어"…
```
</details>

---

## 2. 블록 → 생산 코드 위치 → 등장 모드

조립 순서(실측): `promptLoader.buildFullPrompt` (`src/promptLoader.ts:1312-1515`) → `contentGenerator.buildModeBasedPrompt` 후행 오버레이 (`src/contentGenerator.ts:2960-3182`) → `buildContentJsonOutputFormat` (`src/contentJsonPromptFormat.ts:435-618`, `[원본 텍스트]` 마커 포함) → `situationDepth` / `situationTitle` / `finalContract` (`contentGenerator.ts:3255` 에서 **마커 뒤**에 이어붙음 = user 파트) → `costPolicy.qualityDirective` (`contentGenerator.ts:6661`) → `[RUNTIME RETRY…]` (`:6664`) → 설계도 삽입 (`:6689`, `insertBlueprintIntoPrompt` 가 `[원본 텍스트]` 직후에 끼움).

| # | 블록 (라이브 라벨) | 생산 코드 | SEO | 홈판 | 비고 |
|---|---|---|---|---|---|
| 1 | `[BLOGGER IDENTITY CORE]` | `promptLoader.ts:965-1032 buildIdentityBlock` + `DEFAULT_IDENTITY :942-958` | ○ | ○ | 사용자 identity 미설정 → 기본 프로필. `buildFullPrompt :1334, :1356` |
| 2 | `[홈판 제목 제약]` (neoHook) | `content/neoHookTitles.ts:335-380 buildNeoHookPromptBlock` | — | ○ (issue-story 카테고리 제외, `promptLoader.ts:1349-1352`) | 블랙리스트 `neoHookTitles.ts:156-160` |
| 3 | `[MODE VOICE: …]` | `promptLoader.ts:742-897 MODE_VOICE_GUIDES` (seo :743, homefeed :801), `getModeVoiceGuide :903` | ○ | ○ | |
| 4 | `[STYLE OVERRIDE: 친근한 톤]` ×2 | `promptLoader.ts:717-736 getToneInstruction` (persona `TONE_PERSONAS :587-`), prefix `:1355-1359` + suffix `:1373-1376` | ○×2 | ○×2 | 같은 문자열 2회 |
| 5 | prefix 꼬리 `⚠️ 위 [BLOGGER IDENTITY]…상위입니다` | `promptLoader.ts:1356-1358` | ○ | ○ | |
| 6 | `[SECTION -2]…[SECTION 14]` (seo base) | `src/prompts/seo/base.prompt:1-530` (라이브 L = base L + 99) via `buildSystemPrompt :189-191` | ○ | — | mate 도 seo/base 로드 |
| 7 | `[HOMEFEED BASE PROMPT]…[FINAL CHECK]` | `src/prompts/homefeed/base.prompt:1-243` (라이브 L = base L + 143) | — | ○ | |
| 8 | 카테고리 보정 `${mode}/${category}.prompt` | `promptLoader.ts:200-208` | (general → 없음) | (general → 없음) | 두 실행 모두 category=general 로 해석됨 |
| 9 | `🎯 [노출·인용 구조 ES-1~5]` | `src/prompts/shared/exposure-structure.prompt` via `promptLoader.ts:212-219` | ○ | — | |
| 10 | `🎯 [상황-공감 깊이 SD-1~3]` | `shared/situation-depth.prompt` via `:223-230` | ○ | ○ | |
| 11 | `[OFFICIAL NAVER EXPOSURE PRIORITY OVERRIDE]` | `shared/official-exposure-rubric.prompt` via `:236-243` | ○ | ○ | 영어 |
| 12 | `SEO 90+` / `HOMEFEED 90+ QUALITY CONTRACT` | `shared/seo-90-quality.prompt` / `shared/homefeed-90-quality.prompt` via `:248-261` | ○ | ○ | |
| 13 | `[HEADINGS: SEO]` / `[HEADINGS: 홈판]` | `shared/headings-seo.prompt` / `shared/headings-homefeed.prompt` via `:270-282` | ○ | ○ | |
| 14 | `[BRIEF-HEAD] BH-1/BH-2` | `shared/fact-brief-header.prompt` via `:289-298` | ○ | — | |
| 15 | `[HASHTAG] HT-1~3` | `shared/hashtag-strategy.prompt` via `:368-377` | ○ | ○ | |
| 16 | `[ANGLE] 같은 사실을 세 각도로` | `shared/reader-angles.prompt` via `:385-394` | ○ | ○ | |
| 17 | `[HUMAN WRITING ANTI-PATTERN CONTRACT]` | `shared/human-writing-anti-pattern.prompt` via `:399-406` | ○ | ○ | 두 모드 바이트 동일 (3,510) |
| 18 | `🏠 [홈판 상위노출 본문 원칙]` | `content/homefeedExposurePattern.ts:5-20 buildHomefeedExposureSkeleton` via `promptLoader.ts:1381-1383` | — | ○ | |
| 19 | `[원본 제목 활용 지침]` | `promptLoader.ts:1386-1390` (인라인) | ○ | ○ | |
| 20 | `[검증된 노출 성공 제목]` | `content/exposureWinnersBlock.ts:85` → `contentRecentWinnersBlock.ts:23` → `buildFullPrompt :1479-1482` | (없음) | ○ | recentWinners 있을 때만 |
| 21 | `🌐 [GEO/AEO OVERLAY] G1~G5 + 자가 점검` | `src/prompts/seo/geo-overlay.prompt` (라이브 L = geo L + 1027) via `contentGenerator.ts:2964-2979` (기본 ON, seo/affiliate/mate) | ○ | — | |
| 22 | `## 팩트 규율 — 일곱 가지` | `content/factDisciplineGuard.ts:79 appendFactDisciplineGuard` via `contentGenerator.ts:3038-3046` | ○ | ○ | |
| 23 | `[표 설정 — 위 규칙보다 우선]` | `contentGenerator.ts:3122-3129` | (includeSummaryTable=false 일 때만) | — | 이번 실행 미출현 |
| 24 | `[출력 형식…]` + `[SEO 모드 필수 규칙]`/`[홈판 모드 필수 구조 규칙]` + `[SEO 제목 생성 가이드]` | `contentJsonPromptFormat.ts:243-306 buildModeStructureRule`, 조립 `:484-486` | ○ | ○ | |
| 25 | `📊 [모든 모드 공통: 표/체크리스트…]` | `contentJsonPromptFormat.ts:308-322` | ○ | ○ | |
| 26 | `{ JSON output schema }` | `contentJsonPromptFormat.ts:488-509` (preWritingAnalysis `:107-158`, summaryTable `:499-504`, 길이 `content/titleLengthPolicy.ts:94-102`) | ○ | ○ | |
| 27 | `📌 [모든 모드 — 제목보다 추론이 먼저다]` | `contentJsonPromptFormat.ts:160-241 buildPreWritingAnalysisDirective` | ○ (seoClickContract :176-187) | ○ (homefeedClickContract :166-175) | |
| 28 | `📌 [근거 인용]` / `📌 [소제목 스타일]` / `🎨 [이미지 프롬프트]` | `contentJsonPromptFormat.ts:511-536` | ○ | ○ | |
| 29 | `[원본 텍스트]` 마커 | `contentJsonPromptFormat.ts:538`; 분리 `src/promptSplitter.ts:38,64-90` | ○ | ○ | system/user 경계 |
| 30 | `[설계도]` `[당사자 발언]` `[핵심 사실]` | `content/blueprint/renderBlueprintMaterial.ts:19,27,35` → `contentGenerator.ts:6480, 6689` | ○ | ○ | |
| 31 | `🎲 [STRUCTURE OVERRIDE]` | `promptLoader.ts:1284-1309 buildStructureVariationDirective` via `contentJsonPromptFormat.ts:466-468` | — | ○ (issue-story 제외) | |
| 32 | `[VOICE PROFILE]` | `contentVoiceProfile.ts:68 buildVoiceProfileBlock` via `contentJsonPromptFormat.ts:539` | ○ | ○ | 매 글 랜덤 → 캐시 미스 원인 |
| 33 | `🎯 [필수 키워드 정보]` + `[SEO/홈판 모드 제목 필수 조건]` + `📊 [참고 지표]` | `contentJsonPromptFormat.ts:541-584` (`buildPrimaryKeywordBlock :414-427`, `buildMetricsBlock :429-433`) | ○ | ○ | |
| 34 | `📄 [원본 본문]` + 번호표 안내 + `[자료 Sxx]` | `contentJsonPromptFormat.ts:586-589` (`rawText`), 렌더 `content/sourceDocumentRender.ts:12-16, 37` | ○ | ○ | rawText = 유일한 "source" |
| 35 | `⚠️ [최종 강제 조건 — 위반 시 0점]` | `contentJsonPromptFormat.ts:591-616` | ○ | ○ | |
| 36 | `[SITUATION DEPTH]` | `content/situationDepthContract.ts:30-75` via `contentGenerator.ts:3231, 3255` | ○ | ○ | 홈판에서도 "검색자" 문구 |
| 37 | `[TITLE — 상황·경험 기준 (2026)]` | `content/situationTitleContract.ts:154-215` (seo :91, homefeed :102-110) via `contentGenerator.ts:3244-3252` | ○ | ○ (issue-story 제외) | |
| 38 | `[EVIDENCE AND INTENT FINAL CONTRACT]` | `content/evidenceIntegrity.ts:176-250` via `contentGenerator.ts:3223-3226` | ○ | ○ | |
| 39 | `[1회 완성 품질 계약: balanced]` | `geminiCostOptimizer.ts:115-150` (`qualityDirective`) via `contentGenerator.ts:6661` | ○ | ○ | |
| 40 | `[RUNTIME RETRY AND CONTEXT INSTRUCTIONS]` + `[QualityGate 90+…]` / `[Quality Gate — 재생성 지시]` / `[제목 약속 미이행]` | `contentGenerator.ts:6664`; `content/quality90Gate.ts:156`; `content/titleAnswerRetry.ts:21-29` | ○(재시도) | ○(재시도) | 첫 시도에는 없음 |

미출현(조건부) 블록: `applyFactCheckHardConstraint` (`contentFactCheckConstraint.ts:38`, hasFactCheckSource), `buildGeneralContentGuardBlock` (`content/generalContentGuard.ts:58`, 근거 없을 때), `appendPublicInfoFactTable` (`content/publicInfoFactTable.ts:95`), `buildCelebrityFactGuardBlock` (`content/celebrityAssertionSanitizer.ts:171`, homefeed 제외), `experience-contract.prompt` (옵트인), `ai-tab-friendly.prompt`, `issue-story.prompt`/`issue-claim-discipline.prompt`/`issue-brief-structure.prompt` (issue 카테고리), `[확정 제목]` (`contentGenerator.ts:6698-6702`), `contentPolicyPrompt`/`adaptiveDirective` (`:6667-6682`, 맨 앞 prepend).

관찰: 홈판 실행(변우석 텐텐, 연예)이 `category=general` 로 풀려 issue-story 골격·claim-discipline 이 빠지고 대신 neoHook + STRUCTURE OVERRIDE(속보·이슈형)가 들어갔다. `resolveHomefeedIssueHint` (`contentGenerator.ts:2819-2828`) 가 승격하지 않은 케이스 — 예산 문제와 별개로 확인 필요.

---

## 3. DUPLICATE 인벤토리 — 같은 뜻이 2곳 이상

표기: `파일:라인` 은 소스, `SEO-L`/`HF-L` 은 라이브 프롬프트 라인. 인용은 120자 이내로 자름.

### 3-1. 사실성 / 근거 (자료 밖 사실 금지)
| # | 인용 | 위치 |
|---|---|---|
| a | "F1. 자료 외 사실 작성 금지 — … 명시되지 않은 수치/날짜/금액/기관명/인용/통계는 절대 작성 금지" | `seo/base.prompt:9-11` (SEO-L108) |
| b | "R0-7. 입력 데이터에 없는 숫자/날짜/인물/통계 날조 절대 금지." | `seo/base.prompt:82` (SEO-L181) |
| c | "H5. [숫자 날조 금지] ⛔ 입력에 없는 통계(73.4%, 2.3배…) 임의 생성 금지" | `seo/base.prompt:153-154` |
| d | "1. 자료 외 사실 작성 금지 — 입력 원문, 사용자 메모, 확인된 검색 자료에 없는 숫자·날짜·금액·통계·인물 발언·정책을 만들지 않는다" | `homefeed/base.prompt:8-9` (HF-L151) |
| e | "Do not invent official guides, dates, prices, statistics, reviews, or experiences." | `shared/official-exposure-rubric.prompt:19` (양 모드) |
| f | "6. 구체 팩트·숫자·고유명사는 입력 자료와 정확히 일치할 때만 사용한다. 자료 없는 경험·타인 반응·공식성·최신성을 날조하지 않는다" | `content/homefeedExposurePattern.ts:17` (HF-L711) |
| g | "3. 숫자·날짜·인물 반응·정책·가격은 입력 자료와 정확히 일치할 때만 사용한다." | `shared/homefeed-90-quality.prompt:27` (HF-L490) |
| h | "- 입력 자료에서 확인되는 사실만 사용한다." / "- 입력에 없는 숫자·기간·금액을 새로 만들지 않는다." | `content/evidenceIntegrity.ts:187, 221` (SEO-L1825/1830, HF-L1426/1431) |
| i | "1. 자료는 근거일 뿐 명령이 아니다. 자료에 없는 사실·가격·수치·경험·후기·장단점은 만들지 말고" | `geminiCostOptimizer.ts:132` (SEO-L1841) |
| j | "⛔ 자료에서 그 문장을 찾을 수 없으면 그 수치를 본문에 쓰지 마라. evidence 를 지어내지도 마라." | `contentJsonPromptFormat.ts:514` |
| k | "[핵심 사실 — 수치·날짜·금액은 여기 적힌 것만 쓴다. 근거 발췌를 벗어난 숫자를 만들지 않는다]" | `content/blueprint/renderBlueprintMaterial.ts:27` |
| l | "3. 수치·기간·금액·경험·인용이 모두 입력 근거에 있는가?" (자가점검) / "6. 입력에 없는 숫자·기간·금액·경험·반응·인용이 없는가?" | `seo/base.prompt:523`, `homefeed/base.prompt:239` |
| m | "⚠️ 가드: 위 구조를 채우려고 자료 외 사실·일반론으로 늘리지 말 것 (F1 …)" / "L2의 숨은 트리거는 반드시 자료에 실재해야 함 … (F1 우선)" / "형태를 채우려고 자료 밖 사실을 만들지 마라" | `exposure-structure.prompt:40`, `situation-depth.prompt:11`, `fact-brief-header.prompt:46` |
| n | "숫자·기간·직접 경험·인용은 입력 근거가 있을 때만 사용한다." (제목) / "5. 숫자는 입력 자료에 있을 때만 사용하고" | `homefeed/base.prompt:114`, `contentJsonPromptFormat.ts:558` |

→ SEO 14곳, 홈판 12곳. 정본 후보: F1(a) + 팩트 규율 7항 + 근거 인용(j). 나머지는 각 블록 끝의 "자료 외 금지" 꼬리 한 줄을 지워도 규칙은 남는다.

### 3-2. 숫자 (수치 사용/보존)
| # | 인용 | 위치 |
|---|---|---|
| a | "✅ 반대로 자료에 있는 수치는 빠뜨리지 않는다 — 근거 있는 구체적 숫자가 이 글의 가치다. 금지는 '근거 없는 숫자' 하나뿐이다." | `seo/geo-overlay.prompt:107` (SEO-L1134) |
| b | (a 와 동일 문장) "반대로 자료에 있는 숫자·날짜·기관명은 빠뜨리지 않고 쓴다 — 근거 있는 구체적 숫자가 이 글의 가치다. 금지는 '근거 없는 숫자' 하나뿐이다." | `contentJsonPromptFormat.ts:515` (SEO-L1311, HF-L869) |
| c | "★ [수치는 뜻과 함께] 숫자를 내놓을 때는 그 숫자가 무엇을 뜻하는지 같은 자리에서 말한다." (+ ⛔/⭕ 예시 6줄) | `exposure-structure.prompt:28-37` (SEO-L656-665) |
| d | "숫자만 나열하지 말고 그 숫자가 생활에서 뭘 뜻하는지 번역한다. (예: '6.9인치'가 아니라 …)" | `content/situationDepthContract.ts:66-67` (SEO-L1760, HF-L1361) |
| e | "✅ 본문 H2당 최소 1개의 검증 가능한 구체 (수치/날짜/금액/조건)" | `geo-overlay.prompt:99` |
| f | "- 구체 수치/날짜/조건 1개 포함이 이상적." (답변블록) | `seo/base.prompt:215` |
| g | "⚠️ 자료에 구체적인 이름·날짜·회차가 있는데도 뭉뚱그리지 마라." | `content/factDisciplineGuard.ts` 말미 (SEO-L1200) |
| h | "- 숫자와 감정어의 개수를 맞추지 않는다." / "숫자 채우기·키워드 밀도·가짜 체험·감정어 개수를 맞추지 않는다" | `homefeed/base.prompt:23`, `evidenceIntegrity.ts:217` |

### 3-3. 출처 / 귀속
| # | 인용 | 위치 |
|---|---|---|
| a | "F2. 출처 토큰·메타 표현 금지 … ⛔ `[자료]`·`[자료N]`·각주, '자료에 따르면/입력 자료에/관련 안내에서는' 노출 금지" | `seo/base.prompt:16-17` |
| b | "H6. [출처 지시어 남발 금지] ⛔ 'YTN 보도에 따르면', '기사를 보니', '원문에서는', '영상에 따르면' ⛔ '본 기사', '해당 자료', '관계자에 따르면'" | `seo/base.prompt:157-159` |
| c | "- '기사를 보니' / '보도에 따르면' 같은 출처 단어는 절대 사용 금지 (base H6 위반)" | `geo-overlay.prompt:30` |
| d | "[금지 패턴 — base H6 충돌] ❌ 'YTN 보도에 따르면' / '기사를 보니' / '원문에서는' ❌ '관계자에 따르면' …" (b 목록 재수록) | `geo-overlay.prompt:70-73` |
| e | "★ 구체 수치/날짜/기준을 자료 범위 내에서 본문에 자연스럽게 녹인다(F2 — [자료N] 토큰·출처 메타 표현 노출 금지)" | `exposure-structure.prompt:23` |
| f | "- 출처를 꼭 밝혀야 하는 대목(확정 안 된 정보·논란·수치 인용)에서만 'tvN은 확정된 바 없다'처럼 … 1~2곳이면 충분하다." | `human-writing-anti-pattern.prompt:56` |
| g | "✅ 단, 아래 두 경우는 귀속을 정확히 밝힌다 — 글 전체에서 1~2곳이면 충분하다." (f 와 같은 규칙) | `seo/base.prompt:162-166` |
| h | "2. 간접 자료는 작성자 경험으로 바꾸지 않는다. 출처 표시가 필요한 주장에만 정확한 주체를 밝힌다." | `homefeed-90-quality.prompt:26` |
| i | "※ 아래 [자료 Sxx] 번호표는 내부 식별자다. 본문에 'S01', '[자료 3]' 같은 번호표를 옮겨 적지 마라." | `content/sourceDocumentRender.ts:12` |
| j | "- 자료의 존재·부족·범위를 독자에게 말하지 않는다. '제공된 문구', '현재 자료에는' … 근거 메타 서술을 본문에 쓰지 않는다." | `evidenceIntegrity.ts` (SEO-L1826) |
| k | "F4 … ⛔ '(자료에 명시 없음)', '자료에 명시되어 있지 않습니다', '입력 자료에는', '확인되지 않습니다'를 독자 본문에 반복 노출 금지" / "F6 … ⛔ '자료에 명시되어 있지 않습니다/자료에 답이 없습니다' 같은 메타 표현 노출 금지" | `seo/base.prompt:27-31, 36-39` |
| l | "6. 확인 못 한 정보는 언급 자체를 하지 않는다. ⛔ '정확한 내용은 확인되지 않았습니다', '자료에는 없지만'" | `factDisciplineGuard.ts:65-68` |

→ 메타 표현 금지(F4/F6/j/l) 4곳, 출처 지시어 금지(F2/H6/c/d/e) 5곳, 귀속 허용 조건(g/f/h) 3곳. §4-1 과 겹친다.

### 3-4. 반복 금지 (어미·전환문·구조)
| # | 인용 | 위치 |
|---|---|---|
| a | "→ 비율표처럼 맞추지 말고 문맥에 맞게 선택. 같은 어미 연속 2회 금지." | `promptLoader.ts:1007` (BLOGGER IDENTITY) |
| b | "■ 어미 로테이션 (같은 어미 2문장 연속 금지)" | `promptLoader.ts:752` (MODE VOICE SEO) |
| c | "■ 핵심 규칙: 같은 어미 2회 연속 금지." | `promptLoader.ts:735` (STYLE OVERRIDE, ×2 등장) |
| d | "B14. 동일 어미 3회 이상 연속 ('~입니다. ~입니다. ~입니다.')" / "❌ 3연속 같은 어미는 금지" | `seo/base.prompt:371, 428` |
| e | "[어미 로테이션 — v2.10.1 같은 어미 2회 연속까지만 허용 (이전 3회 → 2회로 강화)]" | `seo/base.prompt:419` |
| f | "- [어미 팔레트 — 필수] ~합니다/~해요만 3문장 이상 연속되면 사람이 아니라 안내문이다. … 후렴처럼 반복하면 흉내가 된다" | `human-writing-anti-pattern.prompt:8-14` |
| g | "- ~거든요/~잖아요/~더라고요는 글 전체의 양념이다. 같은 어미가 후렴처럼 반복되면 홈판에서도 AI 티가 난다." | `promptLoader.ts:812` (MODE VOICE 홈판) |
| h | "2. ~거든요 / ~잖아요 / ~더라고요, 감탄사, 유행어는 필요한 곳에만 쓰고 후렴처럼 반복하지 않는다." | `homefeed-90-quality.prompt:13` |
| i | "- '솔직히', '막상', '사실은', '진짜', '거든요', '잖아요', '더라고요'를 후렴처럼 반복하지 않는다." | `homefeed/base.prompt:181` |
| j | "- 종결어미 비율: … 같은 어미 3연속 금지." | `contentVoiceProfile.ts:70` |
| k | "- 같은 어미와 같은 전환문이 반복되지 않는가?" / "8. 같은 상투어·전환문·어미·문단 구조가 반복되지 않는가?" | `human-writing-anti-pattern.prompt:74`, `homefeed/base.prompt:241` |
| l | "3. 문단마다 같은 구조를 반복하지 않는다." / "모든 섹션에 같은 4단 구조, 숫자, 질문, 갈고리를 반복하지 않는다." / "모든 소제목을 질문형, 명사형, 같은 길이, 같은 4단 구조로 맞추지 않는다." | `human-writing-anti-pattern.prompt:22`, `seo/base.prompt:277`, `homefeed/base.prompt:149` |

→ "같은 어미 연속 금지" SEO 10곳 / 홈판 9곳. 2회와 3회가 섞여 있다(§4-13).

### 3-5. 문장 길이 / 문단 길이
| # | 인용 | 위치 |
|---|---|---|
| a | "• 문장 길이: 보통 (평균 25~40자)" | `promptLoader.ts:982, 1011` |
| b | "- 한 문장 20~35자 권장, 40자 초과 금지" | `seo/base.prompt:491` |
| c | "- 짧은(5~12자) + 보통(15~25자) + 긴(30~45자) 섞어라" | `seo/base.prompt:402` |
| d | "- 1문장당 25~45자 (LLM 발췌 최적 구간) - 2문장 합쳐 60~100자" | `geo-overlay.prompt:48-49` |
| e | "[ES-1] 각 소제목 첫 문장 = 직답 (40~80자)" / "[답변블록 길이 40~80자]" / "1문장 요약(55~80자)" | `exposure-structure.prompt:7, 38`, `seo/base.prompt:213` |
| f | "- 한 단락 2~3문장 (모바일 1화면)" / "① 단락 길이: … 완결된 생각 단위" / "[단락 = 의미 단위] '한 단락 = 한 의미 덩어리'" | `seo/base.prompt:489, 282, 494-498` |
| g | "- 문단은 2~3문장(모바일 화면 2~3줄)으로 묶고" / "3. 모바일 문단은 2~3문장(화면 2~3줄)으로 묶고 … 문장 하나를 문단 하나로 잘게 끊지 않는다" / "- 한 문단은 한 판단만 담고 … 공백을 둔다" / "3. 한 문단에는 핵심 판단 하나를 둔다." / "- 한 문단에는 핵심 판단 하나만 둔다." | `homefeed/base.prompt:204-205`, `homefeedExposurePattern.ts:14`, `promptLoader.ts:813`, `homefeed-90-quality.prompt:14`, `homefeed/base.prompt:162`, `human-writing-anti-pattern.prompt:67` |
| h | "6. Mobile rhythm: … Prefer 1-2 sentence paragraphs." / "Use meaningful sections, short mobile paragraphs" | `seo-90-quality.prompt:12`, `official-exposure-rubric.prompt:27` |
| i | "- 문단 리듬: 한두 문장짜리 짧은 문단을 사이사이 끼워 호흡을 끊는다." | `contentVoiceProfile.ts` (SEO-L1366) |

### 3-6. 말투 / 문체 (존댓말·리듬·감탄사)
| # | 인용 | 위치 |
|---|---|---|
| a | "- 모든 글톤은 존댓말 기반이다. 평어 단정형(~다/~이다/~한다) 남발은 AI 보고서처럼 보이므로 본문 종결어미로 쓰지 않는다." | `promptLoader.ts:728` (STYLE OVERRIDE ×2) |
| b | (a 재서술) "- 모든 글톤은 존댓말 기반이다. ~다/~이다/~한다 평어 종결은 본문 기본 말투로 쓰지 않는다." | `seo/base.prompt:412` |
| c | "- casual/text_hip/community_fan처럼 가벼운 톤도 반말·~임/~함이 아니라 낮은 존댓말(~해요/~네요/~죠?)로 리듬을 만든다." | `promptLoader.ts:730` (×2) |
| d | (c 재서술) "- casual/text_hip/community_fan처럼 가벼운 톤도 반말이나 ~임/~함이 아니라 낮은 존댓말로 변주한다." | `seo/base.prompt:414` |
| e | "- 쇼핑/리뷰/정보 글은 '사실', '막상', '다만', '그래도', '여기서 봐야 할 건' 같은 입말 연결어를 필요한 곳에만 쓰고" | `promptLoader.ts:732` (×2) |
| f | (e 재서술) "- 쇼핑/리뷰/정보 글은 '사실', '막상', '다만', '그래도', '여기서 봐야 할 건' 같은 입말 연결어를 넣어 구매 판단 흐름을 만든다." | `seo/base.prompt:415` |
| g | "- 독자가 AI가 아니라 실제 사람이 옆에서 설명한다고 느껴야 한다. 사람보다 사람처럼 보이려면 감탄사가 아니라 구체 상황, 판단의 이유…" | `promptLoader.ts:733` (×2) |
| h | (g 재서술) "- 사람다운 문장은 감탄사나 추임새가 아니라 구체적 맥락, 판단 이유, 한계, 다음 확인 행동으로 만든다." | `evidenceIntegrity.ts:222` |
| i | "사람다운 글은 감탄사와 추임새의 개수가 아니라 생각의 흐름에서 나온다." / "1. 사람 말투는 감탄사를 늘리는 것이 아니다." / "- 의미 없는 이모지·감탄사·유행어로 사람 흉내 내기" / "4. … 호들갑, 감탄사, 유행어로 사람을 흉내 내지 않는다." | `homefeed/base.prompt:160`, `human-writing-anti-pattern.prompt:5`, `promptLoader.ts:824`, `homefeedExposurePattern.ts:15` |
| j | "- 기본은 낮은 존댓말. ~해요/~네요/~죠/~입니다를 자연스럽게 섞는다." / "1. 낮은 존댓말을 기본으로 하되" / "- 존댓말 기반으로 ~요체와 ~입니다체를 … 섞는다." | `promptLoader.ts:811`, `homefeed-90-quality.prompt:12`, `homefeed/base.prompt:184` |
| k | 페르소나 문단(367자) 전체 2회 | SEO-L85 = L1012, HF-L128 = L690 |
| l | "핵심 문장은 짧게, 이유 문장은 구체적으로, 한계 문장은 솔직하게 쓴다." | `human-writing-anti-pattern.prompt:68`, `homefeed/base.prompt:161` |
| m | "- 다음 문장은 관찰, 이유, 예외, 판단, 행동 중 하나를 새로 더한다." / "각 문장은 … 관찰, 근거, 예외, 판단, 다음 행동 중 하나를 새로 더해야 한다." / "다음 문장은 … 근거·예외·체감·판단 중 하나로 전진시킨다." | `homefeed/base.prompt:163`, `human-writing-anti-pattern.prompt:20`, `promptLoader.ts:731` |

→ STYLE OVERRIDE 의 "사람 말투 리듬" 6문장은 `seo/base.prompt:408-416` [STYLE OVERRIDE 우선] 과 문장 단위로 중복이고, STYLE OVERRIDE 자체가 2회 들어간다 → 같은 6문장이 SEO 프롬프트에 3회.

### 3-7. 체류시간 / 도입부 / 첫 화면
| # | 인용 | 위치 |
|---|---|---|
| a | "· 도입부 = 검색자 상황(L2 깊이) + 공감 + 핵심 직답 + 읽을 이유/얻을 정보 + 궁금증 증폭" | `promptLoader.ts:735` (STYLE OVERRIDE ×2, 홈판에도 "검색자") |
| b | "1. 도입 3문장 내 핵심 답변 먼저 제시 (결론 선행)" | `promptLoader.ts:748` |
| c | "R0-4. 도입부는 첫 화면 안에서 핵심 답과 적용 범위를 보여준다." | `seo/base.prompt:74` |
| d | "[도입부 3~4줄 구조] 1줄 (핵심 답변) … 4줄 (본론 브릿지)" + "[첫 문장 — 공식이 아니라 원칙]" | `seo/base.prompt:232-253` |
| e | "[SD-1] 상황 깊이 = L2 … [SD-2] 가치 명시 … [SD-3] 직답 ↔ 궁금증 긴장 해소 (체류)" | `situation-depth.prompt` (양 모드) |
| f | "[BH-2] 도입부 = 기준 시점(있을 때만) + 답 먼저 (3~5문장)" | `fact-brief-header.prompt:35-44` |
| g | "1. First screen: give the answer in 2-3 short paragraphs before background." / "The first screen must answer the real user question directly." | `seo-90-quality.prompt:7`, `official-exposure-rubric.prompt:14` |
| h | "[SITUATION DEPTH] … [디테일] [상황 분기] [결정 지원] [좁고 깊게] [질문 선점]" | `situationDepthContract.ts:53-73` (양 모드, user 파트) |
| i | "- 도입 2~3문장 안에 핵심 답과 계속 읽을 이유를 준다." | `geminiCostOptimizer.ts:137` |
| j | "- 검색 의도에 대한 짧은 답을 먼저 주고 조건·예외·절차·확인처로 깊이를 더한다." | `evidenceIntegrity.ts` (SEO-L1832) |
| k | 홈판: "[GAMMA-7] 첫 3문장 안에서 다음 세 가지가 보여야 한다" / "1. 첫 3문장 안에 독자의 구체 상황, 핵심 답 또는 판단 기준, 계속 읽을 이유" / "1. 첫 화면에서 독자의 구체 상황과 핵심 답을 함께 보여준다." / "1. 도입: … 첫 3문장 안에 보여준다." / "- introduction: 2~4개의 짧은 문장. 제목이 던진 질문에 먼저 답하고" / "1. 첫 화면에 독자 상황, 곧 나올 답의 예고, 읽을 이유가 있는가?" | `homefeed/base.prompt:29`, `homefeed-90-quality.prompt:7`, `homefeedExposurePattern.ts:12`, `promptLoader.ts:806`, `contentJsonPromptFormat.ts:262`, `homefeed/base.prompt:231` |

→ 도입부 스펙 SEO 10곳, 홈판 9곳. 홈판은 §4-5 처럼 값이 서로 다르다.

### 3-8. SEO (키워드 밀도·위치)
| # | 인용 | 위치 |
|---|---|---|
| a | "R0-1. 메인 주제는 제목에서 분명하게 보이되 첫 3글자나 고정 위치로 옮기지 않는다." | `seo/base.prompt:68` |
| b | "R0-6. 키워드 횟수와 밀도를 맞추지 않는다." | `seo/base.prompt:81` |
| c | "- 메인·서브 키워드의 횟수, 밀도, 소제목 개수를 맞추지 않는다." | `seo/base.prompt:309` |
| d | "- 키워드는 제목과 첫 답변에서 주제가 분명해질 만큼만 사용 (횟수·밀도 강제 금지)" | `promptLoader.ts:757` |
| e | "※ 키워드 위치는 R0-1을 따른다 — 분명하게 보이되 첫 3글자나 고정 위치로 옮기지 않는다. … 발행 단계에서 처리한다." | `seo/base.prompt:436-440` |
| f | "키워드를 첫 3글자로 끌어오려고 어순을 비틀지 마세요(R0-1)." | `contentJsonPromptFormat.ts:295` |
| g | "→ 제목에서 주제가 분명하게 보이는 자연스러운 위치에 1회 사용 → 본문에는 … 밀도·횟수를 맞추지 말 것" | `contentJsonPromptFormat.ts:419-426` |
| h | "1. 메인 주제를 제목의 자연스러운 위치에 1회 포함하되 첫 3글자로 강제 이동하지 않는다." | `contentJsonPromptFormat.ts:554` |
| i | "2. 메인 주제는 제목에 자연스럽게 1회 포함하고, 소제목·서론·결론에 강제로 반복하지 않는다." | `contentJsonPromptFormat.ts:596` |
| j | "- [SEO 모드] 메인 키워드가 제목에 분명히 보여야 한다. 위치는 base R0-1을 따른다 — 첫 3글자나 고정 위치로 옮기지 않는다." | `situationTitleContract.ts:91-92` |
| k | "- 메인 키워드는 제목과 본문에 의미상 필요한 만큼만 쓴다. 제목 첫 3글자, 밀도, 소제목 반복을 맞추기 위한 문장 삽입은 금지한다." | `evidenceIntegrity.ts:210` |
| l | "Keyword density is only a spam guard." / "2. Include the primary keyword naturally … do not repeat it mechanically." / "- … 모든 소제목에 주제어를 반복해 박지 않는다." | `official-exposure-rubric.prompt:38`, `seo-90-quality.prompt:8`, `headings-seo.prompt:12-13` |

→ "밀도·횟수 맞추지 마라" 8곳, "첫 3글자 강제 금지" 6곳 (SEO). 홈판에도 g·i·k 와 `promptLoader.ts:806/812`, `headings-homefeed.prompt:15-20` 이 있다.

### 3-9. 검색 의도
| # | 인용 | 위치 |
|---|---|---|
| a | "★ 키워드를 글로 만들기 전에 '검색자가 왜 이걸 검색했는가'를 먼저 추론한다." + I1~I4 + Q1~Q4 | `seo/base.prompt:44-64` |
| b | "R0-11 … 모든 글은 '독자가 이 검색을 한 진짜 이유'에 답해야 한다. 키워드가 들어간 글이 아니라 '검색 의도/맥락에 답하는 글'이" | `seo/base.prompt:86-90` |
| c | "'searchIntent': '정보형|비교형|거래형 중 판정 + 독자의 실제 질문 1문장', 'mustAnswer': […]" | `contentJsonPromptFormat.ts:128-129` |
| d | "1. Intent answer fit - The first screen must answer the real user question directly." / "SEO mode: optimize for search intent completion" | `official-exposure-rubric.prompt:13-15, 37` |
| e | "Write for a reader who searched because they need an answer now." | `seo-90-quality.prompt:3` |
| f | "2. 독자가 이 글에서 해결하려는 핵심 질문 하나와 한 문장 답을 먼저 정한다." | `geminiCostOptimizer.ts:133` |
| g | "- 이 글이 답할 질문: …" (설계도) | `renderBlueprintMaterial.ts:35-` |
| h | "[검색 클릭 계약] 검색자는 이미 질문을 들고 결과 목록을 훑는다" | `contentJsonPromptFormat.ts:177-180` |

### 3-10. 금지어 (충격·대박·알아보겠습니다 등)
| # | 인용 | 위치 |
|---|---|---|
| a | "■ 절대 금지 표현 … 대박, 충격, 미쳤어요, 소름, 알아보겠습니다, 살펴보자" | `promptLoader.ts:955, 1014-1016` |
| b | "- 과장된 훅 ('충격!', '대박!', '미쳤어요!')" / "- 과도한 뻔한 AI티 ('충격!', '알고보니!', '대박')" | `promptLoader.ts:762`, `:826` |
| c | "B19. 충격/경악/소름/난리/대박/폭로 감정 자극어 남용" + B1~B20 | `seo/base.prompt:357-377` |
| d | "R0-8. '결론적으로', '정리하면', '알아보겠습니다' 등 AI 정리체 금지." / "⛔ 금지: '결론적으로', '정리하면', '이상으로'" / B1·B3·B4 | `seo/base.prompt:83, 325, 358-361` |
| e | "충격·경악·소름·대박·난리·폭로·진실 공개 같은 봇 단어로 시작하지 않는다." / "'안녕하세요, 오늘은', '알아보겠습니다', '끝까지 보세요' 같은 진행 안내는 쓰지 않는다." | `homefeed/base.prompt:38-39` |
| f | "⛔ B급 훅 블랙리스트 (사용 시 감점 -8/건): 충격, 경악, 소름, 폭로 … 완벽 정리" (35개) | `neoHookTitles.ts:156-160, 359-364` |
| g | "- 충격, 경악, 소름, 비밀 공개 같은 자극어는 사용하지 마세요." / "3. 충격·소름·대박·비밀 공개·난리 같은 클릭베이트를 금지한다." | `contentJsonPromptFormat.ts:293, 577` |
| h | "'이거 저만 그런가요?' 같은 빈 질문, 충격·경악·소름·대박 같은 자극어도 금지." | `situationTitleContract.ts:210` |
| i | "- 감정 훅 라벨: '충격적인 사실', '이것만 알면 끝', '달라진 ○○'" / "- 만능 라벨: '달라진 ○○', '꼭 챙겨야 할 ○○', '실제로 체감한 ○○'" / "⛔ '달라진 X', '꼭 챙겨야 할 X', '실제로 체감한 X' — AI 티 3종 만능 라벨 금지." | `headings-seo.prompt:32`, `headings-homefeed.prompt:31`, `seo/base.prompt:72` |
| j | "⛔ 인사말·자기소개·'오늘은 ~에 대해 알아보겠습니다' 금지." / "❌ '여러분 안녕하세요, 오늘은 X에 대해 알아볼게요'" / "- '안녕하세요, 오늘은 ~에 대해 알아보겠습니다' (설명체)" / "주제 소개, 인사말, '알아보겠습니다'로 시작하지 않는다." | `fact-brief-header.prompt:44`, `geo-overlay.prompt:54`, `seo/base.prompt:251`, `geminiCostOptimizer.ts:137` |

→ "충격/대박" 계열 SEO 8곳·홈판 8곳, "알아보겠습니다" SEO 6곳·홈판 4곳, "달라진 ○○" 3곳.

### 3-11. 제목
| # | 인용 | 위치 |
|---|---|---|
| a | "R0-9. 제목은 22~42자 안에서 주제와 독자가 얻을 답·판단 기준을 보여준다. 경험과 숫자는 입력 근거가 있을 때만 쓴다." | `seo/base.prompt:84` |
| b | "[SEO 제목 — 상황 기준] [메인 키워드] + [독자가 처한 상황] + [그 상황의 답]" + ✅예시 4 + "[쇼핑커넥트 제목]" + "⛔ 제목 즉시 탈락 패턴" + "[서술형 키워드 SEO 재구성 규칙]" | `seo/base.prompt:434-471` (SEO-L533-570) |
| c | "[원본 제목 활용 지침] - 입력에 없는 반전·손실·집단 반응·직접 경험·최신성을 후킹 요소로 추가하지 마세요." | `promptLoader.ts:1386-1390` |
| d | "💡 [SEO 제목 생성 가이드 — 상황 기준] … 검색어를 제목에 원문 그대로 붙여 넣지 마세요 … 예: '여권 재발급 방법' → '여권 재발급, 주말에 급하게…'" | `contentJsonPromptFormat.ts:292-304` |
| e | (d 와 동일 예시·문장) "검색어를 제목에 원문 그대로 붙여 넣지 마라 — 핵심 명사는 유지하되 … 예: 검색어 '여권 재발급 방법' → '여권 재발급, 주말에 급하게 해야 할 때 순서'" | `situationTitleContract.ts:93-98` (SEO-L1793-1798) |
| f | "⚠️ [SEO 모드 제목 필수 조건] 1~5" | `contentJsonPromptFormat.ts:553-558` |
| g | "[TITLE — 상황·경험 기준 (2026)] 제목 공식은 버린다 … [상황 조각 — 필수] … [약속과 이행] … [감정은 말하지 말고 장면으로] … [금지]" (2,078자) | `situationTitleContract.ts:154-215` |
| h | "'selectedTitle': '제목 1 (25~40자 — 넘기면 …)'" + titleCandidates whyClick | `contentJsonPromptFormat.ts:489-497` |
| i | "[약속-상환] 제목이 약속한 답은 introduction 과 headings 가 반드시 갚는다" / "- 제목이 던진 질문·숫자·조건·방법은 도입부 첫 3~5문장 안에서 직접 답한다." / "[약속과 이행] … 도입부 첫 3~5문장이 직접 답한다." / "- 제목이 약속한 내용은 본문에서 바로 확인할 수 있어야 하며" / "- 제목이 약속한 내용을 본문에서 실제로 해결하고" | `contentJsonPromptFormat.ts:186`, `evidenceIntegrity.ts:209/213`, `situationTitleContract.ts:190`, `promptLoader.ts:1390`, `geminiCostOptimizer.ts:139` |
| j | 홈판: "[홈판 제목 제약]" 1,237자 / "[TITLE] 제목" 2,330자 / "⚠️ [홈판 모드 제목 필수 조건] 1~7" / "[TITLE — 상황·경험 기준]" 2,027자 / "[검증된 노출 성공 제목]" / homefeedClickContract 4항 / "[TITLE PAYOFF — 필수]" | `neoHookTitles.ts:335-380`, `homefeed/base.prompt:73-125`, `contentJsonPromptFormat.ts:573-583`, `situationTitleContract.ts`, `exposureWinnersBlock.ts:85`, `contentJsonPromptFormat.ts:166-175`, `homefeed/base.prompt:116-124` |

→ 제목 규칙 블록 SEO 7개(≈3,700자), 홈판 8개(≈7,500자). "제목의 약속을 도입부가 갚는다" 만 SEO 5곳·홈판 7곳.

### 3-12. CTA / 결론
| # | 인용 | 위치 |
|---|---|---|
| a | "3. 결론: 한 줄 요약 + 행동 유도 (CTA)" | `promptLoader.ts:750` |
| b | "· 마무리 = 핵심 요약 + 다음 행동(CTA)/여운 (톤에 맞는 어투로, 단 흐지부지·중복 결론 금지)" | `promptLoader.ts:735` (×2) |
| c | "⛔ 금지: '도움이 되셨다면 공감 눌러주세요'" + "[결론부 — 공식 없음 (2026-08-26 개정)]" 서사 + "⛔ 주제와 무관하게 결론마다 반복되는 덩어리(체크리스트·공유 유도·공감 요청)는 쓰지 않는다." | `seo/base.prompt:324-345` |
| d | "- conclusion: finalVerdict 의 판단으로 돌아와 매듭짓는다 … 본문 요약 되풀이·'결론적으로/정리하면' 금지." | `contentJsonPromptFormat.ts:290` |
| e | 홈판: "[RETENTION] 댓글·저장·공유를 모두 요구하지 않는다. … 하나만 선택한다." / "[저장할 이유와 댓글 달 거리] 저장·댓글·공유를 모두 요구하지 않는다." / "- 댓글 질문·저장·공유 유도는 … 1개 이하로" / "7. … 댓글·저장·공유 유도는 … 하나를 선택하며, 필요 없으면 넣지 않는다." / "- 저장·댓글·공유를 모두 요구하지 않는다. … 하나만 남긴다." / "- conclusion: … 댓글·저장·공유를 동시에 요구하지 않는다." | `homefeed/base.prompt:211-225`, `homefeed-90-quality.prompt:17-22`, `promptLoader.ts:820`, `homefeedExposurePattern.ts:18`, `evidenceIntegrity.ts:205`, `contentJsonPromptFormat.ts:267` |

→ 홈판 "CTA 는 하나만" 6곳.

### 3-13. FAQ
| # | 인용 | 위치 |
|---|---|---|
| a | "R0-3. … FAQ는 실제 반복 질문이 있을 때만 넣고 고정 위치를 만들지 않는다." | `seo/base.prompt:71` |
| b | "- 질문 개수와 위치를 고정하지 않는다. FAQ가 필요 없는 주제에는 넣지 않는다." | `seo/base.prompt:225` |
| c | "[ES-3] FAQ 섹션 (필요할 때만) ★ [2026-08-26] 개수를 고정하지 않는다. base(R0-3)가 … 이미 말하는데" (역사 서술 3줄) + "3~5개" | `exposure-structure.prompt:14-20` |
| d | "[검색 종결 Q&A 패턴 — 실제 질문이 있을 때만] … 1~2개를 결론 바로 앞에서 답한다." | `seo/base.prompt:347-352` |
| e | "5. 키워드, 질문형 소제목, 표, FAQ, CTA를 개수 맞추기로 넣지 않았는가?" / "7. 키워드, 질문형 소제목, 표, FAQ, CTA의 개수를 맞추지 않았는가?" | `seo/base.prompt:525`, `homefeed/base.prompt:240` |
| f | "Tables, checklists, FAQ, and step blocks are good only when they help the reader." / "3. Add one evidence block when the topic supports it: table, checklist, comparison, FAQ" | `official-exposure-rubric.prompt:28`, `seo-90-quality.prompt:9` |

### 3-14. 해시태그
| # | 인용 | 위치 |
|---|---|---|
| a | "[HASHTAG] HT-1 두 층 / HT-2 개수 — 모드에 따라 다르다 (SEO 10~15 / 홈판 3~7 / 쇼핑 8~12) / HT-3" | `shared/hashtag-strategy.prompt` (양 모드 동일 918자) |
| b | "'hashtags': ['해시태그1', '해시태그2', '해시태그3']" | `contentJsonPromptFormat.ts:507` |

→ 중복은 없다. HT-2 의 타 모드 2줄과 예시(김병지/나는솔로 6개)만 모드별로 잘라낼 수 있다.

### 3-15. 홈판 구조 (첫 화면·소제목 역할·모바일)
| # | 인용 | 위치 |
|---|---|---|
| a | "[STRUCTURE] 소제목 수는 정보량에 맞춘다. 보통 3~7개면 충분하지만 정확한 개수를 맞추지 않는다. 각 소제목은 서로 다른 역할을 맡는다." | `homefeed/base.prompt:128-129` |
| b | "- 소제목 개수는 정보량에 맞춘다. 정해진 숫자는 없다." / "- 전부 공감, 전부 정보 라벨처럼 같은 역할로 채우지 않는다." | `headings-homefeed.prompt:22, 25` |
| c | "5. 소제목은 질문·기준·비교·주의점 등 내용에 맞게 변주하고, 첫 1~2문장에서 그 소제목의 핵심 답을 준다. 각 소제목은 서로 다른 정보 단위를 맡는다." | `homefeedExposurePattern.ts:16` |
| d | "- headings: 위 구조 힌트를 따르되 … (개수를 맞추려고 얕은 소제목을 추가하지 않는다)" / "- 각 소제목은 앞 소제목과 다른 질문·판단을 맡고" | `contentJsonPromptFormat.ts:263-265` |
| e | "■ 소제목 개수: 6개 안팎 (±1)" (STRUCTURE OVERRIDE — a·b 와 반대 방향) | `promptLoader.ts:1291` |
| f | "3. 소제목마다 서로 다른 하위 질문을 배정한 뒤" / "5. 각 소제목이 다른 하위 질문을 완결하는가?" / "2. 제목이 주체를 생략했다면 본문 첫 단락에서 바로 공개한다." vs "[STRUCTURE] 정체 공개 … 본문 앞부분에서 명확히 밝힌다" | `geminiCostOptimizer.ts:134`, `homefeed/base.prompt:238`, `homefeedExposurePattern.ts:13`, `homefeed/base.prompt:132-134` |
| g | 모바일: "[MOBILE] 문단은 2~3문장" / "3. 모바일 문단은 2~3문장" / "- 한 문단은 한 판단만 담고 … 공백" / "- 완결된 생각 단위로 문단을 나눈다" | `homefeed/base.prompt:203-205`, `homefeedExposurePattern.ts:14`, `promptLoader.ts:813` |
| h | 명사형 종결: "실제 홈판 노출 글 실측: 문단 종결이 명사형 42%, 구두점 38%다." / "3-1. … 실측 기준 홈판 문단의 42%가 마침표 없이 명사로 끝난다" / "- 명사형으로 끊어도 된다. 실측 기준 홈판 문단 종결의 42%가 명사형이다." | `homefeed/base.prompt:186`, `homefeedExposurePattern.ts:15`, `headings-homefeed.prompt:10` |

---

## 4. CONFLICT 인벤토리 — 서로 반대로 말하는 쌍

### 4-1. 출처를 밝혀라 vs 출처 표현 금지
- 밝혀라: "실제 출처 귀속은 **적극적으로 써라**: '보건복지부 발표에 따르면', '기아 공식 가격표 기준', '소속사 입장에 따르면', 'OO일보 보도에 따르면'처럼 그 자료의 기관/매체 이름을 그대로 쓴다." — `content/sourceDocumentRender.ts:13-14` (SEO-L1395, HF-L984, 자료 바로 앞)
- 밝혀라: "[당사자 발언 — 아래 중 최소 2개를 본문에 큰따옴표로 그대로 싣고, 발언자를 밝힌다]" — `renderBlueprintMaterial.ts:19`
- 금지: "H6 … ⛔ 'YTN 보도에 따르면', '기사를 보니' ⛔ '관계자에 따르면', '한 매체에 따르면' → … 확인된 사실은 근거 표현 없이 원래 알던 것처럼 그냥 단정" — `seo/base.prompt:157-160`
- 금지: "'기사를 보니' / '보도에 따르면' 같은 출처 단어는 절대 사용 금지 (base H6 위반)" — `geo-overlay.prompt:30`; "[허용 패턴 — 출처 명시 없이 권위 시그널만 부여] ✅ '공식적으로는 ~' (어디 공식인지 명시 X)" — `geo-overlay.prompt:63-64`
- 금지: "F2 … '자료에 따르면/입력 자료에/관련 안내에서는' 노출 금지(AI 티)" — `seo/base.prompt:17`
- 절충: "귀속 … 글 전체에서 1~2곳이면 충분하다" — `seo/base.prompt:162`, `human-writing-anti-pattern.prompt:56`
- 실측: 홈판 meta `extra.unsupportedAttributions: [{phrase:"이상 기준", orgName:"상"}]` — 모델은 귀속을 쓰고 발행 경계 스크러버가 지운다(메모리 "출처귀속 3중삭제").
- 정리 방향: 정본 하나 — "확정 아닌 정보·수치·발언 인용은 자료의 기관/매체명을 그대로 적어 귀속(글 전체 1~3곳), 그 외 확인된 사실은 근거 표현 없이 단정, `[자료N]`·'자료에 따르면' 같은 내부 메타는 금지" — 로 H6·F2·G1·G3·sourceDocumentRender 문구를 대체.

### 4-2. 숫자 적극 활용 vs 숫자 없는 문장이 안전
- 활용: "✅ 본문 H2당 최소 1개의 검증 가능한 구체 (수치/날짜/금액/조건)" — `geo-overlay.prompt:99`; "구체 수치/날짜/조건 1개 포함이 이상적" — `seo/base.prompt:215`; "자료에 있는 수치는 빠뜨리지 않는다 — 근거 있는 구체적 숫자가 이 글의 가치다" — `geo-overlay.prompt:107`, `contentJsonPromptFormat.ts:515`; "[ES-4] 사실 밀도" — `exposure-structure.prompt:22`
- 회피: "H5 … → 수치가 필요하면 '상당수', '절반 가량', '꽤 많은' 등 범용 표현." — `seo/base.prompt:155`; "✅ 자료에 없지만 상식으로 아는 것은 수치 없이 쓴다('여러 번', '며칠' 처럼)" — `contentJsonPromptFormat.ts:517`; "숫자나 표가 없더라도 정확한 답이 우선이다" — `evidenceIntegrity.ts:211`
- 회피 어휘 자체를 금지: "F3. 일반론 금칙어 (위반 시 0점): '보통', '일반적으로', '흔히', '대체로', '많은 분들이'" — `seo/base.prompt:19-25`; 반면 제목 계약은 "대신 '생각보다', '의외로', '많이들', '자주' 를 쓴다" — `situationTitleContract.ts:198-199`
- 실측: SEO 재시도 지시 "근거 없는 구체 수치: … (1%, 300만원, 120만원, 10만원, 25만원, 5만원)" (SEO-L1872) — 300만원·120만원·25만원·10만원은 설계도 [핵심 사실] 9번(SEO-L1358)에 그대로 있다. 게이트가 자료 안 숫자를 위반으로 몰아 재생성을 불렀다.

### 4-3. 표/마크다운 허용 vs 금지
- 금지: "[절대 금지 서식] … - HTML/마크다운 서식 일체 … ⛔ <table>, <tr>, <td>" — `seo/base.prompt:475-486`; "❌ 표(table) / 마크다운 (base SECTION 12 위반)" — `geo-overlay.prompt:91`; "❌ 글 전체가 1, 2, 3, 4, 5 번호 매김 (네이버 정보 페이지로 인식 — 감점)" — `geo-overlay.prompt:90`
- 허용: "★ 비교·선택·비용·절차 주제는 마크다운 표(`| 헤더 | 헤더 |` 형식, 모바일 고려 최대 2열)" — `exposure-structure.prompt:24`; "- 표는 … 최대 2열 마크다운으로 작성한다: | 항목 | 정리 |" — `contentJsonPromptFormat.ts:312-316`; "④ … **비교는 세로 번호 리스트(1./2./3.)**. 표는 최대 2열까지." — `seo/base.prompt:285-286`; "JSON 문자열 값 안의 마크다운 표·리스트는 허용" — `contentJsonPromptFormat.ts:598`; summaryTable 스키마 — `fact-brief-header.prompt:10`
- 정리 방향: SECTION 12 를 "볼드·밑줄·HTML 태그 금지, 마크다운 표(≤2열)·대시 리스트만 허용" 한 줄로 고치고 geo G4 금지 패턴 2줄 삭제.

### 4-4. 제목 길이 — 값이 네 가지
- SEO: "R0-9. 제목은 22~42자" — `seo/base.prompt:84`; "2. 22~42자 길이" — `contentJsonPromptFormat.ts:555`; 스키마 `'selectedTitle': '제목 1 (25~40자 …)'` — `content/titleLengthPolicy.ts:96` (`seo: {min:25,max:40}`)
- 홈판: "33~42 권장 … → 33 미만은 안 된다. … 42를 넘겨도 된다 — 실측상 42~48 은 1.05배, 48 초과는 1.57배" — `homefeed/base.prompt:75-92`; "□ 28~42자 유지" — `neoHookTitles.ts:375` (HF-L71); "1. 28~42자 길이" — `contentJsonPromptFormat.ts:575` (HF-L969); "· [길이] 28~42자. 피드 카드에서 잘리면 뒷부분이 아예 보이지 않는다" — `situationTitleContract.ts:106` (HF-L1395); 스키마 "33~42자 — 넘기면 피드·검색에서 뒷부분이 잘려 안 보인다" — `titleLengthPolicy.ts:94`
- 홈판 base 는 "42 초과 불리하지 않다" 를 6줄에 걸쳐 설명하는데 같은 프롬프트의 스키마·계약 3곳은 "넘기면 잘린다" 로 반대. `titleLengthPolicy.ts` 주석(1-16행) 이 이미 이 불일치를 기록하고 있다.

### 4-5. 홈판 도입부 — "답부터" vs "다 풀지 마라"
- 다 풀지 마라: "답을 숨겨 체류 시간을 늘리지 않는다. 다만 첫 문단에서 전부 풀어버리지도 않는다. … 정체를 감춘 제목은 본문 12% 지점, 그렇지 않은 제목은 20% 지점에서 답한다. 어느 쪽이든 첫 3~5문장 안에 **전부** 풀어버린 글은 홈판에 못 간 글에서 더 흔했다." — `homefeed/base.prompt:34-37` (HF-L177-180); FINAL CHECK 1-2 — `homefeed/base.prompt:231-235`; "제목에 이미 대상이 드러나 있으면 … 10~36% 구간에 둔다" — `homefeed/base.prompt:120-121`
- 답부터: "- introduction: 2~4개의 짧은 문장. 제목이 던진 질문에 먼저 답하고" — `contentJsonPromptFormat.ts:262`; "[약속과 이행] 제목이 던진 질문·조건·결과에는 도입부 첫 3~5문장이 직접 답한다." — `situationTitleContract.ts:190` (HF-L1401); "7. 제목이 만든 궁금증은 도입부가 즉시 갚는다." — `contentJsonPromptFormat.ts:582`; "2. 제목이 주체를 생략했다면 본문 첫 단락에서 바로 공개한다." — `homefeedExposurePattern.ts:13`; "★ 표면 답(큰 결론)은 도입부에서 먼저 준다" — `situation-depth.prompt:35`; "- 도입 2~3문장 안에 핵심 답" — `geminiCostOptimizer.ts:137`
- FINAL CONTRACT 는 절충: "제목에서 정체를 감췄으면 도입부 첫 3~5문장 안에서 답하고, 대상이 이미 드러나 있으면 본문 앞 10~36% 구간" — `evidenceIntegrity.ts` (HF-L1434). 정본은 이 한 줄이면 된다.

### 4-6. "자연스럽게 / AI 에게 위임" vs 문체 규칙 과다
- 위임 선언: "글톤 정체성(페르소나)만 명확히 제시 → AI가 어미/연결어/리듬을 자유롭게 추론 … 기존: 어미 리스트, 예시 문장, 구조 구간 등 40줄 강제 → 이질감" — `promptLoader.ts:579-582` (주석); "→ 비율표처럼 맞추지 말고 문맥에 맞게 선택" — `promptLoader.ts:1007`; "[진짜 사람 글의 지문 (HW) — 권장 항목, 개수 의무 없음]" — `seo/base.prompt:379`
- 그러나 수치 강제가 남아 있음: "기본: ~입니다 / ~이에요 / ~더라고요 / ~답니다 (정보체 60% + 친근체 40%) 강조: ~거든요 / ~이죠 (한 문단에 1회 이하)" — `promptLoader.ts:753-754`; "HW1. 1문장 단락 최소 2개 HW2. 수사의문문 500자당 1개 HW3. 사후 정정 1회 … HW11. 독자 직접 호명 1회" — `seo/base.prompt:384-398`; "- 종결어미 비율: … 구어 종결을 전체의 약 21% 섞는다" — `contentVoiceProfile.ts:70`; "[질문 하한 — 필수] … 최소 두 번 직접 쓴다" — `homefeed/base.prompt:164`; "- 능동 60% / 수동 40%" — `seo/base.prompt:403`; "이모지·감탄사: 최소화 (글 전체 3개 이하)" vs "이모지 전체 0~5개" vs "B20. 이모지/특수기호 5개 초과" — `promptLoader.ts:767`, `seo/base.prompt:487, 377`
- 감정: "3. 완벽한 AI 스타일 배제. 사소한 입말(아 그리고, 근데, 보니까), 괄호 덧붙임, 감정 노출을 자연스럽게." — `promptLoader.ts:1028`; "HW5. 복합 감정 1회 / HW8. 감정 흔들림 1회" — `seo/base.prompt:388, 391` vs "1. 사람 말투는 감탄사를 늘리는 것이 아니다 … 글 전체 1~2회만" — `human-writing-anti-pattern.prompt:5-7`; "- 사람 말투를 흉내 내기 위한 체감·망설임은 만들지 않는다." — `seo/base.prompt:416`; "감탄사·추임새가 아니라" — `evidenceIntegrity.ts:222`

### 4-7. "구체적으로" vs "자료 외 사실 금지"
- 구체화 요구: "[디테일 — 자료 기반 간접 경험] … 첫 화면부터 어떤 인증이 필요하고 어떤 서류를 어디서 올리는지, 모바일로도 되는지, 어디서 막히기 쉬운지를 순서대로 구체화한다." — `situationDepthContract.ts:42-46`; "H4 … 모든 문장은 누가/무엇을/언제/얼마/어떻게 중 최소 1개의 구체 정보 포함." — `seo/base.prompt:151`; "[SD-1] … '누구나 겪지만 아무도 명확히 안 짚은 깊은 층위(L2)'" — `situation-depth.prompt:7-9`; "[상황 분기] … 최소 2가지 상황을 나눠서 각각의 답을 준다." — `situationDepthContract.ts:59`; "3. Original angle - Add what similar posts usually miss" — `official-exposure-rubric.prompt:22`
- 금지: F1, 팩트 규율 6·7("이유·유래·전망을 지어내지 않는다"), FINAL CONTRACT "구체성이 필요하면 실제 조건, 대상, 순서, 예외를 쓴다" — `evidenceIntegrity.ts:221`; "- 공식 자료에 없는 디테일이나 실패담을 차별화 장치로 만들어내지 않는다." — `seo/base.prompt:293`
- 각 블록이 "자료에 있을 때만" 단서를 달지만, 자료가 "최소 2가지 상황"·"막히는 지점"·"L2 트리거" 를 담고 있지 않을 때 모델은 둘 중 하나를 어긴다. 정본은 F1 하나. 나머지는 조건문을 뒤집어 "자료가 갈리는 조건을 주면 그 조건대로 나눈다" 로 쓰는 편이 안전하다.

### 4-8. 1인칭 / 후기 중계
- 허용: "✅ 일반화 표현 (사용자 경험 데이터 없을 때): '여러 사용자 후기에서 반복적으로 보이는 패턴은', '이용해본 분들의 평가를 종합하면'" — `seo/base.prompt:124-129`; "✅ 전달 '후기에서 이 얘기가 반복되더라구요'" — `human-writing-anti-pattern.prompt:38`
- 금지: "- 남의 글을 중계하지 않는다: '후기에서는', '~라는 후기도 있어', '현장 후기의 관찰이므로', '~라고 소개됐습니다'." — `evidenceIntegrity.ts:69` (SEO-L1828, HF-L1429)
- 허용: "- 이 글을 쓰는 사람은 자료를 실제로 찾았고, 대조했고 … 그 행위에 대한 1인칭은 날조가 아니다. ✅ 조사 '찾아보니 조건이 두 갈래로 갈리더라구요'" — `human-writing-anti-pattern.prompt:29-33`
- 금지: "- 그렇다고 '자료를 보면', '보도 흐름을 보면', '확인해보면', '제가 확인한 바로는'을 매 문장·매 소제목마다 붙이지 마라." — `human-writing-anti-pattern.prompt:54`; "H2. [거짓 노력 서사 금지] ⛔ '비교해봤는데'" — `seo/base.prompt:139-142`
- FINAL CONTRACT 가 "이 블록과 충돌하는 앞선 규칙은 무효" 라 선언하므로(`evidenceIntegrity.ts:217`) H1 의 일반화 표현 5줄은 실효 없이 450자를 차지한다.

### 4-9. 첫 소제목 — 주어로 시작 강제 vs 강제 시작 금지
- 강제: "- [강제] 1번 소제목은 반드시 메인 주제(주어)로 시작 (예: '아이폰16 디자인' - O)" — `contentJsonPromptFormat.ts:288` (SEO-L1207)
- 금지: "- 첫 소제목을 메인 키워드로 강제 시작하지 않는다." — `seo/base.prompt:258` (SEO-L358); "→ 소제목은 검색 질문과 흐름을 우선하며, 같은 키워드로 반복 시작하지 말 것" — `contentJsonPromptFormat.ts:426`; "- 모든 소제목에 주제어를 반복해 박지 않는다." — `headings-seo.prompt:13`; 홈판 "- 검색어를 소제목 앞에 접두로 붙이지 않는다." — `headings-homefeed.prompt:15`

### 4-10. 결론 = 핵심 요약 vs 요약 되풀이 금지
- 요약하라: "3. 결론: 한 줄 요약 + 행동 유도 (CTA)" — `promptLoader.ts:750`; "· 마무리 = 핵심 요약 + 다음 행동(CTA)/여운" — `promptLoader.ts:735`; "[ES-5] 도입부 또는 말미에 핵심을 압축한 1문장 요약(55~80자)" — `exposure-structure.prompt:38`; "(QualityGate) 독자가 바로 저장하거나 인용할 수 있는 결론, 기준, 예외, 체크리스트, 표/FAQ를 자연스럽게 포함" — `quality90Gate.ts` (SEO-L1865)
- 되풀이 금지: "- conclusion: … 본문 요약 되풀이·'결론적으로/정리하면' 금지." — `contentJsonPromptFormat.ts:290`; "⛔ 본문에서 이미 설명한 수치를 결론에서 다시 나열하지 마라." — `exposure-structure.prompt:33`; "⛔ 주제와 무관하게 결론마다 반복되는 덩어리(체크리스트·공유 유도·공감 요청)는 쓰지 않는다." — `seo/base.prompt:345`; R0-8/B4 "정리하면" 금지

### 4-11. 오늘 날짜 — 알려주면서 모른다고 함
- 알려줌: "'todayIs': '2026년 9월 22일'" — `contentJsonPromptFormat.ts:114`; "8. 오늘은 2026년 9월 22일이다. 이 날짜가 자료의 시점을 판정하는 유일한 기준이다." — `contentJsonPromptFormat.ts:607`
- 모른다: "⛔ 자료에 날짜가 없으면 날짜 앵커를 쓰지 말고 … 너는 오늘 날짜를 모른다. 작성 시점을 추정해 넣는 것은 날조다." — `fact-brief-header.prompt:38-39` (SEO-L845-846); "⛔ '○월 ○일 기준' 작성일 못박기 금지(실시간 기준)" — `seo/base.prompt:14`
- 못박아라: "★ 입력 자료에 시행일·개정일·기준일이 있으면 그 값을 첫 문장에 못박는다." — `fact-brief-header.prompt:36`; "G1 … ✅ 입력 자료에 시행일·개정일·기준일이 적혀 있으면 그 값을 그대로 쓴다." — `geo-overlay.prompt:21-22`
- 날짜 규율이 6곳(F1 / 팩트 규율 4·5 / BH-2 / G1 / 최종 강제 7·8 / dateBasis 지시). 정본은 dateBasis 지시(`contentJsonPromptFormat.ts:229-236`) + 팩트 규율 4·5 로 족하다.

### 4-12. 문장 길이 상한
- "- 한 문장 20~35자 권장, 40자 초과 금지" — `seo/base.prompt:491` vs "긴(30~45자) 섞어라" — `seo/base.prompt:402` vs "1문장당 25~45자" — `geo-overlay.prompt:48` vs "[ES-1] 직답 (40~80자)" — `exposure-structure.prompt:7` vs "문장 길이: 보통 (평균 25~40자)" — `promptLoader.ts:982`

### 4-13. 같은 어미 연속 — 2회 vs 3회
- 2회: `promptLoader.ts:735, 752, 1007`, `seo/base.prompt:419` — 3회: `seo/base.prompt:371, 428`, `human-writing-anti-pattern.prompt:8`("3문장 이상 연속"), `contentVoiceProfile.ts:70`("3연속 금지")

### 4-14. 홈판 명사형 종결 — STYLE OVERRIDE 금지 vs 홈판 base 권장
- 금지: "- casual/… 가벼운 톤도 반말·~임/~함이 아니라 낮은 존댓말" — `promptLoader.ts:730` (홈판 프롬프트에 2회)
- 권장: "- 모든 문단을 완결 서술문으로 닫지 않아도 된다. 명사형으로 끊는 문단을 섞는다. 실측 … 명사형 42%" — `homefeed/base.prompt:185-187`; `homefeedExposurePattern.ts:15`; `headings-homefeed.prompt:10`

### 4-15. FAQ 개수
- "3~5개" — `exposure-structure.prompt:18` vs "FAQ는 실제 반복 질문이 있을 때만 넣고 고정 위치를 만들지 않는다" — `seo/base.prompt:71` vs "1~2개를 결론 바로 앞에서" — `seo/base.prompt:348`. ES-3 은 스스로 "여기서 '3~6개'로 고정하면 정면 충돌" 이라 적어 놓고 다음 줄에 "3~5개" 를 둔다.

### 4-16. 실행 환경과 어긋난 지시 (죽은 텍스트)
- "F5. temperature 가이드 — SEO 모드는 0.1 권장" — `seo/base.prompt:33-34`; 실제 meta `temperature: 0.5`. 모델은 온도를 못 정한다.
- "⚠️ CUE: 서비스는 2026-04-09 공식 종료" — `seo/base.prompt:2` (역사 메모)
- "※ [2026-08-05] R0-13 … 과 R0-14 … 를 삭제했다." 5줄 — `seo/base.prompt:104-108` (삭제 사유 서술이 프롬프트에 남음)
- "[SITUATION DEPTH — 검색자의 상황을 해결하는 글] … '검색한 사람의 구체적인 상황'" — `situationDepthContract.ts:53-55` 가 홈판(피드 유입)에도 그대로 들어간다.

---

## 5. LOW-VALUE 목록 (장식·반복 강조·긴 예시·위협·메타 서술)

카운트는 지시문 파트 기준(자료 제외). 위치는 라이브 라인.

### 5-1. 장식 / 반복 강조
| 항목 | SEO | 홈판 | 위치 |
|---|---|---|---|
| 구분선 `═══/━━━` 줄 | 17줄 747자 | 27줄 1,214자 | BLOGGER IDENTITY·MODE VOICE·prefix 꼬리·이미지 규칙·필수 키워드·원본 본문·최종 강제·STRUCTURE OVERRIDE 앞뒤 |
| 빈 줄 | 378 | 357 | — |
| `⛔` | 90 | 34 | — |
| `★` | 75 | 16 | seo/base·exposure-structure·situation-depth·geo·hashtag·fact-brief 의 항목 머리 |
| `❌` | 27 | 1 | — |
| "금지" | 113 | 48 | — |
| 이모지 헤더(🛑🎯🚨🛡️🤖🎨🏗️📱🔑🎭🗣️📝🔒🌐📌💡📊🎲🏠📄) | 24 | 12 | 섹션 제목 앞 |
| "(2026-05 신규)", "(2026.05 신규)", "[2026-08-26]", "v2.10.1", "2026-06-07" 등 버전 꼬리표 | 14 | 4 | `seo/base.prompt:5,44,66,116,419,408`, `exposure-structure.prompt:1,15`, `situation-depth.prompt:1`, `fact-brief-header.prompt:6`, `hashtag-strategy.prompt:3` |

### 5-2. "0점 / 폐기 / 재생성" 위협
| 인용 | 위치 |
|---|---|
| "★ 본 섹션 5개 룰은 다른 모든 룰보다 우선. 위반 시 전체 응답 폐기." | `seo/base.prompt:6` |
| "F3. 일반론 금칙어 (위반 시 0점 — 자동 감지됨)" / "⛔ F1~F6 위반은 RAG/팩트체크 실패와 동일. 응답 거부 또는 재생성 트리거." | `seo/base.prompt:19, 41` |
| "⛔ 검색 의도와 무관한 일반론은 첫 문장부터 0점." | `seo/base.prompt:64` |
| "🚨 [SECTION 0] 절대 규칙 TOP 10 (위반 시 전체 폐기) 🚨" / "⛔ 위 12개 중 하나라도 어기면 전체 생성물 폐기." | `seo/base.prompt:66, 102` |
| "※ 위반 시 -30점/항목 페널티." | `seo/base.prompt:281` |
| "- '이거 저도 진짜 고민 많이 했어요' (모든 주제에 무분별 = 0점)" / "→ 어떤 주제에든 붙일 수 있는 추상적 소제목은 0점." / "⛔ 'A입니다. B입니다. C입니다.' → 독립 문장 나열 = 0점" | `seo/base.prompt:250, 267, 299` |
| "[AI 탐지 신호 블랙리스트 — 사용 시 즉시 0점]" | `seo/base.prompt:357` |
| "⛔ P-B 예시 문구를 그대로 복사하면 폐기" (P-B 는 이미 삭제된 섹션 참조) | `seo/base.prompt:527` |
| "- '공식적으로는' 같은 표현이 3회 이상 = 어색함 = 0점." | `geo-overlay.prompt:78` |
| "억지 어미, 의미 불명 생략, 문법이 깨진 훅 = 0점." (모드별 4회) / "키워드를 요약·나열한 제목은 0점" / "보도자료 문형이라 0점" | `contentJsonPromptFormat.ts:173, 185, 197, 210, 221, 168, 175` |
| "⚠️ [최종 강제 조건 — 위반 시 0점]" | `contentJsonPromptFormat.ts:592` |
| "⛔ B급 훅 블랙리스트 (사용 시 감점 -8/건)" / "하나라도 '아니오'면 재생성." | `neoHookTitles.ts:359, 378` |
| "검증 게이트: … 0~1회면 재생성." (humorous 톤, 이번 실행 미출현) | `promptLoader.ts:612` |

→ SEO 13회 "0점", 4회 "폐기". 점수는 모델이 아니라 평가기가 매기고, 프롬프트 안 점수는 어디에도 연결되지 않는다(메모리 "점수≠게이트").

### 5-3. 메타 서술 (왜 이 규칙이 생겼는지, 무엇을 지웠는지)
| 인용 (앞 80자) | 길이 | 위치 |
|---|---|---|
| "※ [2026-08-05] R0-13(기준 업데이트 시점 표시)과 R0-14(스크랩 가중치)를 삭제했다. R0-13은 …" | 5줄 ~330자 | `seo/base.prompt:104-108` |
| "[결론부 — 공식 없음 (2026-08-26 개정)] 예전 이 자리에는 '6줄 공식'이 있었다. 요약 1줄 + 5개 체크리스트 + …" | 8줄 ~430자 | `seo/base.prompt:328-336` |
| "★ [2026-08-26] 개수를 고정하지 않는다. base(R0-3)가 'FAQ 는 …'고 이미 말하는데, 여기서 '3~6개'로 고정하면 정면 충돌이고 …" | 3줄 ~250자 | `exposure-structure.prompt:15-17` |
| "★ 실측(2026-08): 검색 유입이 붙은 글은 예외 없이 본문 전에 사실을 먼저 줬다. 독자는 읽을지 말지를 …" | 3줄 ~190자 | `fact-brief-header.prompt:3-5` |
| "★ 실측(2026-08): 검색 유입이 붙은 글들의 해시태그는 장식이 아니라 검색어 그 자체였다. … 예) #김병지 #박문성 …" | 4줄 ~230자 | `hashtag-strategy.prompt:3-6` |
| "[2026-09-17 실측 재조정] 폭 구간별 lift(홈판 1,299편 ÷ 미진입 794편): 28 미만 0.69 · 28~33 0.97 …" 및 이어지는 통계 해설 | 17줄 ~900자 | `homefeed/base.prompt:75-92` |
| "같은 재료라도 각도에 따라 홈판 경쟁률이 다르다. 아래는 실측 기회지수다 … 유리: 관계 2.02 · 연예 1.50 … 패션뷰티는 홈판 자리의 21.9%를 차지해" | 19줄 622자 | `homefeed/base.prompt:53-71` |
| "실측상 저장형 성격(체크리스트·표 중심 정리글)은 홈판 노출 글보다 못 간 글에서 더 흔하다 (홈판 29.9% vs 못 간 글 43.6%)" | 3줄 ~180자 | `homefeed/base.prompt:220-222` |
| "괄호 안 배수는 실측값이다(홈판 노출 글에서의 등장률 ÷ …)" + ①~⑤ 배수 | 5줄 ~250자 | `homefeed/base.prompt:96-97, 100-113` |
| "★ Anthropic·RAGAS 검증 기반 — 환각률 80%+ 감소 효과." / "✅ F1~F6 준수 = AI 브리핑·AI 탭 채택률 정량 상승 (출처: Anthropic Cite-then-write, RAGAS, Vectara FaithJudge)." | 2줄 ~140자 | `seo/base.prompt:7, 42` |
| "★ 잡주제 블로그(5+ 카테고리 혼재) = 동일 콘텐츠도 노출률 -30~50% (Conrad 2026 실측). ★ 월 16개+ 발행 + 단일 토픽 = … 트래픽 약 3.5배." (검증 불가 수치 — F1 취지와 반대) | 3줄 ~200자 | `seo/base.prompt:97-99` |
| "★ 검색 결과 상단에 AI 요약 노출 비중 20%+. 인용되면 무료 1위 노출과 같은 효과." / "★ 블로그끼리만 경쟁하던 시대 끝." | 2줄 | `seo/base.prompt:202, 182` |
| "[2026-09-03 라이브 224399815476]" 발행 번호 | 1줄 | `evidenceIntegrity.ts:68` |
| "이 오버레이는 네이버 SEO base.prompt 위에 덧대는 추가 룰이다. … 충돌 시 base.prompt가 우선." + "⚠️ 본 오버레이는 base.prompt를 대체하지 않는다." (오버레이 안에서 base 를 6회 언급) | ~400자 | `geo-overlay.prompt:3-5, 125-126` |
| "★ 기존 도입부 룰(seo R0-4 / homefeed GAMMA-7)을 '보강'만 한다." / "⚠️ 본 보강이 기존 도입부 글자수·줄수·문형 제약과 충돌하면 기존 룰을 따른다." | ~200자 | `situation-depth.prompt:3-4, 41` |
| "★ aiTabFriendlyMode = true 일 때는 ai-tab-friendly.prompt 룰이 본 섹션보다 우선(상위호환)." (ai-tab 미적용 실행에도 출력) | 1줄 | `exposure-structure.prompt:4` |
| "This block has higher priority than older keyword-density, title-formula, emotion-word, and fixed-heading-count rules in this prompt." | 2줄 | `official-exposure-rubric.prompt:3-4` |
| "아래 규칙은 초안을 다시 호출하지 않고 첫 응답을 바로 쓸 수 있게 만드는 최종 작성 절차다. 앞선 스타일·페르소나 규칙과 충돌하면 …" | 142자 1줄 | `geminiCostOptimizer.ts:128` |
| "이 지침은 base.prompt의 모든 톤/어미 지시보다 최우선 적용." (×2) / "⚠️ 위 [BLOGGER IDENTITY] + [MODE VOICE] + [STYLE OVERRIDE]는 문체·정체성의 기준입니다. ⚠️ 단, 근거 계약…이 이보다 상위입니다." | ~250자 | `promptLoader.ts:735, 1356-1358` |

우선순위 선언("이 블록이 앞 규칙보다 우선/하위")이 SEO 프롬프트에 11곳 있다. 앞뒤가 서로 우선이라 주장하므로 선언 자체가 정보를 주지 않는다.

### 5-4. 3줄을 넘는 예시
| 예시 묶음 | 줄수 | 위치 |
|---|---|---|
| H1 일반화 표현 5개 + 의견 표현 4개 | 9 | `seo/base.prompt:124-134` |
| [롱테일 공식] 3 + [통합랭킹 생존 체크리스트] 3 | 6 | `seo/base.prompt:185-199` |
| [첫 문장 패턴] 패턴 1~3 + 예 3 + ❌ 3 | 9 | `seo/base.prompt:205-221` |
| [금지된 템플릿 소제목] ❌ 4줄 | 4 | `seo/base.prompt:262-265` |
| B1~B20 블랙리스트 | 20 | `seo/base.prompt:358-377` |
| HW1~HW15 | 15 | `seo/base.prompt:384-398` |
| [어미 로테이션] 6줄 + 어미 변화 원칙 3줄 | 9 | `seo/base.prompt:420-430` |
| SEO 제목 ✅ 4 + 쇼핑 ✅ 3 + ⛔ 탈락 5 + 재구성 ✅ 4 | 16 | `seo/base.prompt:443-467` |
| [절대 금지 서식] HTML 예시 6줄 | 6 | `seo/base.prompt:475-486` |
| [이미지 앵커] ✅/⛔ 4줄 | 4 | `seo/base.prompt:500-507` |
| ES-4 [수치는 뜻과 함께] ⛔/⭕ 6줄 | 6 | `exposure-structure.prompt:30-37` |
| BH-1 summaryTable JSON 예시 5줄 + label 예시 5줄 + ⛔ 4줄 | 14 | `fact-brief-header.prompt:15-33` |
| HT-1 조합 예 4 + 머리말 예 2 | 6 | `hashtag-strategy.prompt:5-6, 11-14` |
| AG-1 항공 사례 3 + AG-2 1 + AG-3 1 | 5 | `reader-angles.prompt:7-12, 22, 30` |
| HUMAN WRITING §4 ✅ 6 + 시청·관람 8줄 | 14 | `human-writing-anti-pattern.prompt:32-50` |
| GEO G1~G5 ✅/❌ 예시 | 27 | `geo-overlay.prompt:18-27, 39-56, 63-73, 84-89, 99-115` |
| 팩트 규율 1~7 예시 | 12 | `factDisciplineGuard.ts` (SEO-L1160-1201) |
| JSON summaryTable 예시 label 문장 298자 | 1 | `contentJsonPromptFormat.ts:502` |
| [TITLE — 상황·경험 기준] 상황 조각 4 + 감정→장면 2 + 금지 12 | 18 | `situationTitleContract.ts:82-88, 194-196, 205-206` |
| 홈판 [TITLE] ①~⑤ 예시 6 | 6 | `homefeed/base.prompt:100-113` |
| neoHook 구체성 재료 4 + 블랙리스트 6줄 + 자가검토 6 | 16 | `neoHookTitles.ts:341-378` |
| STRUCTURE OVERRIDE "답이 밥이다" 비유 8줄 | 8 | `promptLoader.ts:1298-1305` |

### 5-5. 이번 모드와 무관한 문장 (조건 없이 항상 들어감)
| 인용 | 위치 | 무관한 모드 |
|---|---|---|
| "■ 구매자 신뢰 원칙 (리뷰·제휴 글에서 의무): … 공정위·광고·제휴 고지 문구는 앱이 … 리뷰 글마다 비교 대상 1개 이상" (5줄) | `promptLoader.ts:1018-1023` | SEO·홈판 |
| "[쇼핑커넥트 제목 — 구매 상황 기준] [제품명] + … ✅ 3줄 + ⛔ 제목 즉시 탈락 패턴(대괄호 브랜드·제품명 중복…)" (14줄 ~430자) | `seo/base.prompt:448-460` | SEO (affiliate 는 자체 .prompt 사용) |
| "- 쇼핑/리뷰/정보 글은 '사실', '막상' …" | `promptLoader.ts:732`, `seo/base.prompt:415` | 홈판 |
| "- casual/text_hip/community_fan처럼 가벼운 톤도 …" (선택 톤이 friendly) | `promptLoader.ts:730`, `seo/base.prompt:414` | 양 모드 |
| "Mode-specific override: - SEO mode: … - Homefeed mode: … - Mate mode: …" (3모드 8줄) | `official-exposure-rubric.prompt:36-45` | 각 모드에 타 모드 2개 |
| "[HT-2] 개수 — 모드에 따라 다르다 - SEO·정보성: 10~15개. - 홈판·피드: 3~7개. - 쇼핑: 8~12개." | `hashtag-strategy.prompt:17-20` | 각 모드에 타 모드 2줄 |
| "★ aiTabFriendlyMode = true 일 때는 …" | `exposure-structure.prompt:4` | ai-tab OFF |
| "§4 ✅ 시청·관람 '3화 보다가 이 장면에서 멈췄어요' … 회차·장면·대사·편집 …" (8줄 ~600자) | `human-writing-anti-pattern.prompt:39-46` | SEO 청약통장 글 |
| "- 건강·법률·금융·정부지원은 개인차, 적용 조건, 기준일, 공식 확인 필요성을 분명히 한다." | `homefeed/base.prompt:24` | 연예 글 |
| "📊 [참고 지표] … → 블루오션: 세부 경험·독점 정보" ("경험" 권유가 경험 금지 계약과 부딪힘) | `contentJsonPromptFormat.ts:432` | 양 모드 |
| "[SITUATION DEPTH — 검색자의 상황을 해결하는 글] … [디테일] 신청 절차라면 첫 화면부터 어떤 인증이 …" | `situationDepthContract.ts:42-73` | 홈판 연예 글 |
| "[STYLE OVERRIDE] · 도입부 = 검색자 상황(L2 깊이) …" | `promptLoader.ts:735` | 홈판 |

### 5-6. 자가 점검 리스트 (같은 목적의 체크리스트가 여러 개)
| 리스트 | 항목 수 | 위치 |
|---|---|---|
| [SECTION 14] [출력 직전 확인] | 6 + ⛔2 | `seo/base.prompt:520-530` |
| 🔒 GEO 오버레이 자가 점검 | 6 | `geo-overlay.prompt:117-123` |
| OFFICIAL "Final self-check before output" | 4 | `official-exposure-rubric.prompt:47-51` |
| HUMAN WRITING "최종 자체 점검" | 6 | `human-writing-anti-pattern.prompt:70-76` |
| [1회 완성] [출력 직전 내부 점검] | 3 | `geminiCostOptimizer.ts:142-146` |
| neoHook "■ 최종 자가검토" | 6 | `neoHookTitles.ts:369-378` |
| 홈판 [FINAL CHECK] | 9 | `homefeed/base.prompt:227-243` |
| [모든 모드 — 제목보다 추론] whyClick 자가검증 | 1 | `contentJsonPromptFormat.ts:169, 181` |

SEO 5개(≈1,700자), 홈판 6개(≈2,300자). 항목이 겹치는 것: "입력 근거에 있는가"(4회), "같은 구조 반복"(3회), "제목이 약속한 것에 답했는가"(3회), "메타 표현 출력 X"(4회).

---

## 6. 홈판 전용 관찰

| 항목 | 실측 | 근거 |
|---|---|---|
| 제목 규칙 블록 수 | **8개, ≈7,500자 (instruction 의 15.5%)** | [홈판 제목 제약] 1,237 · [TITLE] 제목 2,330 · [원본 제목 활용 지침] 265 · [검증된 노출 성공 제목] 306 · homefeedClickContract ≈700 · [홈판 모드 제목 필수 조건] 365 · [TITLE — 상황·경험 기준] 2,027 · FINAL CONTRACT 제목 3줄 ≈300 |
| 제목 길이 값 | 4종 (28~42 / 33~42 / "33 미만 금지" / "42 넘어도 됨") | §4-4 |
| CTR·클릭 사유 규칙 | 6곳 | neoHook 자가검토 "이 훅이 약속한 정보 … 답 가능한 훅으로 교체" (HF-L72-73) / [TITLE PAYOFF] (L259-266) / homefeedClickContract [클릭 사유가 제목의 출발점]·[whyClick 자가검증]·[훅은 말이 되어야 한다]·[요약 명사 종결 금지] (L853-861) / 스키마 `surprisingFact`·`clickReason`·`whyClick` (L816-818, 824-826) / 홈판 모드 제목 필수 조건 7 (L976-977) / FINAL CONTRACT "본문이 증명하지 못하는 … 약속하지 않는다" (evidenceIntegrity.ts:245) |
| "제목의 약속을 갚는다" 문장 | 7곳 ("약속" 17회 출현) | §3-11 i·j |
| 노출 "실측" 통계 인용 | 16줄 | [TITLE] lift 표·구간 해설(L219-233), ①~⑤ 배수(L242-255), 정체 공개 2.34배/현재 상태 1.68배/스펙 0.54배(L275-287), 공유 1.32배/저장 0.68배 + 29.9% vs 43.6%(L359-364), 명사형 42%/구두점 38%(L329, L508, L708), 기회지수 표(L202-214), 12%/20% 지점(L179, L261-264) |
| 감정·훅 규칙 | "감탄사" 13회, "충격" 8회, "후렴" 6회, "존댓말" 11회 | §3-6, §3-10 |
| 금지어 리스트 | 9개 리스트 | BLOGGER 절대 금지 표현(6개) · MODE VOICE 금지(5줄) · neoHook B급 블랙리스트(35개) · GAMMA-7 봇 단어(7개) · [TITLE] "정리·현황·포인트·확정·내역·목록"(6개) · [요약 명사 종결 금지](9개) · 홈판 모드 제목 필수 조건 3(5개) · situationTitle [금지](12개 + 자극어 4개) · headings-homefeed 라벨(6+4개) |
| 문체 명령 블록 | 11개, ≈12,700자 (instruction 의 26.4%) | BLOGGER IDENTITY · MODE VOICE 말투 · STYLE OVERRIDE ×2 · [HUMAN WRITING] 진짜 사람 · [섹션 첫 문장 = 발췌 단위] 어미 4줄 · HOMEFEED 90+ [홈판에 유리한 말투] · [ANGLE] 세 각도 · HUMAN WRITING CONTRACT · 홈판 상위노출 원칙 3-1·4 · VOICE PROFILE |
| 첫 화면/도입부 스펙 | 9곳 | §3-7 k + STYLE OVERRIDE·SD·SITUATION DEPTH·1회 완성 |
| CTA "하나만" | 6곳 | §3-12 e |
| 소제목 개수 | "정보량에 맞춘다, 정해진 숫자 없다" 3곳 vs STRUCTURE OVERRIDE "6개 안팎 (±1)" | §3-15 a·b·e |
| SEO-일반 규칙이 홈판에 그대로 들어온 블록 | SITUATION DEPTH 921 ("검색한 사람", "검색자") · STYLE OVERRIDE "검색자 상황(L2)" ×2 · OFFICIAL 2,510 (search intent 중심, 영어) · HASHTAG HT-2 SEO/쇼핑 2줄 · [모든 모드 공통: 표] 599 (홈판은 "필요할 때만" 한 줄) · 팩트 규율 지역/제도 예시 · [소제목 스타일 — 모든 모드 공통] | 합계 ≈4,900자 |
| 카테고리 해석 | 연예 글이 `general` 로 풀려 issue-story 골격·claim-discipline 미적용, neoHook + STRUCTURE OVERRIDE(속보·이슈형) 적용 | HF-L41, L927; `contentGenerator.ts:2819-2828` |
| 자료 분모 | 8건 중 2건 수용(5,377자). rawChars 17,211 → cleanChars 15,303 → 전달 5,377 (31%) | meta.sourceRetention |

---

## 7. 제안 정본 순서와 오늘 블록의 대응

목표 순서: CURRENT DATE → SELECTED TITLE → SEARCH INTENT → RESEARCH/SOURCE SUMMARY → SOURCE DOCUMENTS → CORE WRITING RULES → NAVER/HOMEFEED RULES → OUTPUT FORMAT.

주의: 캐시 적중을 위해 system(정적) / user(편별) 경계는 `[원본 텍스트]` 마커로 유지해야 한다 (`promptSplitter.ts:38`, `contentGenerator.ts:6688` "system 접두가 바뀌면 캐시가 통째로 빠진다"). 따라서 편별 항목(날짜·제목·의도·자료)은 user 파트에, 규칙은 system 파트에 두되 **user 파트 안의 규칙 블록 11.6~11.9K 자를 system 으로 올리는 것**이 순서 정리의 핵심이다. 지금은 SITUATION DEPTH·TITLE 계약·FINAL CONTRACT·1회 완성 계약이 자료 뒤에 붙어 있어 "자료 → 규칙" 순서가 한 번 더 반복된다.

| 정본 슬롯 | 파트 | 오늘 블록 (→ 조치) |
|---|---|---|
| 1. CURRENT DATE | user | `dateBasis.todayIs` (스키마) + 최종 강제 8 → **한 줄** "오늘: 2026-09-22. 자료 날짜는 이 기준으로 과거/미래를 가른다" 로 통합. 팩트 규율 4·5, BH-2 날짜 앵커, G1 시점 시그널, 최종 강제 7은 CORE 규칙 한 항목으로 흡수 |
| 2. SELECTED TITLE | user | `[확정 제목]` (`contentGenerator.ts:6698`, 확정 시) · `[필수 키워드 정보] 📌 원본 제목 참고` · `[SEO/홈판 모드 제목 필수 조건]` · `[검증된 노출 성공 제목]` → 확정 제목 또는 키워드 + 후보 3개 요구 한 블록 |
| 3. SEARCH INTENT | user | 설계도 "이 글이 답할 질문 / 독자 상황 / 소제목 후보 / 뺄 주제" (`renderBlueprintMaterial.ts:35`) + `[참고 지표]` 수치 한 줄 (라벨 "블루오션…" 제거). SECTION -1 의 I1~I4/Q1~Q4 는 스키마 `searchIntent`·`mustAnswer` 가 대신하므로 system 에서 뺀다 |
| 4. RESEARCH/SOURCE SUMMARY | user | `[당사자 발언]` + `[핵심 사실]` (그대로) |
| 5. SOURCE DOCUMENTS | user | `📄 [원본 본문]` + `[자료 Sxx]` (그대로). 번호표 안내(`sourceDocumentRender.ts:12-16`)는 CORE 의 귀속 규칙과 합쳐 한 줄로 |
| 6. CORE WRITING RULES | system | `[SECTION -2] F1~F4·F6` + `[SECTION 1] H1~H9` (일반화 표현 목록 제외) + `## 팩트 규율 7` + `[근거 인용]` + `[EVIDENCE AND INTENT FINAL CONTRACT]` (user→system 이동, 편별 분기는 `hasExplicitFirstPartyEvidence` 한 줄만 user 에 남김) + 귀속 정본(§4-1) + `[SITUATION DEPTH]` 핵심 3항(디테일·상황 분기·결정 지원, user→system) + 도입부 정본 1개(§4-5) + 제목 정본 1개(§3-11) + 소제목 정본 1개(HEADINGS: 모드별) + 문체 정본 1개(STYLE OVERRIDE 1회 + HUMAN WRITING CONTRACT §1~§6, 어미 규칙은 "같은 어미 2회 연속 금지·존댓말·평어 종결 금지" 3줄) + 반복 금지 1개 + 자가 점검 1개(6항) |
| 7. NAVER / HOMEFEED RULES | system | SEO: `[SECTION 3·4·7]` 압축 + `[노출·인용 구조]` ES-1/2/4 + `[BRIEF-HEAD]` + `[HASHTAG]`(모드 줄만) + `[ANGLE]` + `[SECTION 12]` 서식 정정본. 홈판: `[GAMMA-7]`·`[TITLE] ①~⑤`·`[STRUCTURE]`·`[RETENTION]`·`[HEADINGS: 홈판]`·`[HASHTAG]`·`[ANGLE]`. `OFFICIAL…OVERRIDE`·`SEO/HOMEFEED 90+`·`MODE VOICE`·`홈판 상위노출 본문 원칙`·`homefeed-90` 은 위 정본에 흡수 |
| 8. OUTPUT FORMAT | system 말미 | `[출력 형식]` + 모드 구조 규칙 + JSON 스키마 + `[표/체크리스트]` 2줄 + `[이미지 프롬프트]` + 최종 강제 4·5(JSON only) — `[1회 완성 품질 계약]`·`[모든 모드 — 제목보다 추론]` 의 절차 문장은 스키마 필드 설명으로 흡수 |
| (편별 꼬리) | user | `[VOICE PROFILE]`·`[STRUCTURE OVERRIDE]`·`[RUNTIME RETRY…]` — 자료 뒤 그대로. QualityGate 재시도문은 중복 3줄 제거 |

---

## 8. 절감 추정 (병합·제거 항목별)

수치는 §1 표의 블록 chars 에서 뺄 수 있는 양의 추정치. "제거" 는 규칙이 아니라 중복 사본·서술·예시·타모드 문장을 뺀다는 뜻이다. 사실·숫자·귀속·검색의도·제목-본문 연결·CTA·FAQ·해시태그·홈판 구조 규칙의 **정본은 모두 남긴다.**

### 8-A. SEO (instruction 63,051 → 목표 ≤55,773 at 18.6K source)
| # | 조치 | 위치 | 절감 |
|---|---|---|---|
| 1 | STYLE OVERRIDE 두 번째 사본 제거 (prefix 또는 suffix 하나만) | `promptLoader.ts:1373-1376` | −1,683 |
| 2 | SECTION 10 [STYLE OVERRIDE 우선] 6문장 — STYLE OVERRIDE "사람 말투 리듬" 과 동일 → 제거 | `seo/base.prompt:408-417` | −700 |
| 3 | MODE VOICE SEO 어미 로테이션·금지 4줄 (SECTION 10·B19·BLOGGER 와 중복) | `promptLoader.ts:752-766` | −350 |
| 4 | BLOGGER IDENTITY 구매자 신뢰 원칙 5줄(SEO/홈판 무관) + 절대 금지 표현(B19 중복) | `promptLoader.ts:1014-1023` | −600 |
| 5 | SECTION 9 HW1~HW15 + 문장 리듬 공식 → HUMAN WRITING CONTRACT 로 흡수 (권장 항목 15줄) | `seo/base.prompt:379-404` | −900 |
| 6 | GEO 오버레이: G1(BH-2·F1 중복) G2(ES-1·SECTION 4 중복) G3(H6 중복+충돌) G4(표 충돌) G5(ES-4·근거 인용 중복) 자가 점검 → 고유 내용(외부 LLM 목적 2줄, 권위 시그널 허용 5줄, 검색 건수 금지 4줄)만 남김 | `geo-overlay.prompt` 전체 3,683 | −2,800 |
| 7 | [노출·인용 구조] ES-3 역사 서술 3줄 + ES-1/ES-2 를 SECTION 4 로 병합 | `exposure-structure.prompt:14-20, 7-13` | −900 |
| 8 | OFFICIAL OVERRIDE(영어 2,510) + SEO 90+(영어 881) → 한국어 우선순위 6줄로 대체 | `official-exposure-rubric.prompt`, `seo-90-quality.prompt` | −2,400 |
| 9 | 도입부 스펙 5개(SECTION 5·SD-1~3·BH-2·SITUATION DEPTH·STYLE OVERRIDE 머리 2회) → 1개 | §3-7 | −1,800 |
| 10 | SECTION 8 [결론부 — 공식 없음] 서사 8줄 제거, 규칙 5줄 유지 | `seo/base.prompt:328-336` | −550 |
| 11 | SECTION 0 삭제 사유 메모 5줄 + R0-12 검증 불가 통계 3줄 | `seo/base.prompt:104-108, 97-99` | −680 |
| 12 | SECTION -2 F5 temperature + 출처 각주 + 효과 주장 | `seo/base.prompt:7, 33-34, 42` | −390 |
| 13 | H1 [v2.10] 일반화 표현 목록(FINAL CONTRACT 와 충돌) + H5 범용 표현 줄 | `seo/base.prompt:124-129, 155` | −510 |
| 14 | 제목 블록 7개 → 1개: SECTION 11 쇼핑 부분 제거(−430), [SEO 제목 생성 가이드]·[SEO 모드 제목 필수 조건]·[원본 제목 활용 지침]·R0-9 를 [TITLE — 상황·경험 기준] 에 병합 | §3-11 | −2,300 |
| 15 | SECTION 12 [절대 금지 서식] HTML 예시 6줄 → 1줄(§4-3 정정 포함) + 이미지 앵커 예시 | `seo/base.prompt:475-486, 500-507` | −350 |
| 16 | 자가 점검 5개 → 1개 | §5-6 | −1,000 |
| 17 | 소제목 규칙: [HEADINGS: SEO] 를 정본으로 두고 SECTION 6 소제목 원칙·금지 템플릿, [소제목 스타일 공통], [SEO 모드 필수 규칙] 1번 소제목(§4-9 충돌) 제거 | `seo/base.prompt:255-267`, `contentJsonPromptFormat.ts:288-289, 519-521` | −900 |
| 18 | 날짜 규율 6곳 → dateBasis 지시 + 팩트 규율 4·5 | §4-11 | −700 |
| 19 | 표 규칙 5곳 → [표/체크리스트] 2줄 | §4-3 | −400 |
| 20 | HT-2 타 모드 2줄 + 예시 | `hashtag-strategy.prompt:17-20, 5-6` | −100 |
| 21 | [ANGLE] 항공 사례 5줄 | `reader-angles.prompt:7-12, 22, 30` | −250 |
| 22 | HUMAN WRITING §4 시청·관람 8줄을 연예/스포츠 카테고리 조건부로, §1 어미 팔레트(SECTION 10 중복) | `human-writing-anti-pattern.prompt:39-46, 8-14` | −900 |
| 23 | QualityGate 재시도문 중복 3줄 ("입력 자료에서 확인되지 않는 수치" ×3, 구체 개선 지시 ×2) | `quality90Gate.ts:156-` | −500 |
| 24 | [최종 강제 조건] 1(R0-5 사본)·2(키워드 4번째 사본)·3 | `contentJsonPromptFormat.ts:594-597` | −250 |
| 25 | [1회 완성 품질 계약] — 판단 순서·한 번에 완성은 FINAL CONTRACT 와 중복 | `geminiCostOptimizer.ts:128-146` | −500 |
| 26 | [참고 지표] 라벨 + 구분선 | `contentJsonPromptFormat.ts:432` | −150 |
| 27 | 구분선·버전 꼬리표·우선순위 선언 11곳 | §5-1, §5-3 | −900 |
| | **합계** | | **≈ −23,900** |

→ 63,051 − 23,900 ≈ **39,150 자 (≈2.1:1 at 18.6K source)**. 자료가 5,600자인 실행에서는 7:1 로 남는다 — 3:1 은 자료 ≥13K 일 때만 지시문 절감으로 닿는다.

### 8-B. 홈판 (instruction 48,275 → 목표 ≤21,500 at 5.4K source)
| # | 조치 | 위치 | 절감 |
|---|---|---|---|
| 1 | STYLE OVERRIDE 두 번째 사본 | `promptLoader.ts:1373-1376` | −1,684 |
| 2 | BLOGGER IDENTITY 구매자 신뢰·금지 표현 | `promptLoader.ts:1014-1023` | −600 |
| 3 | 제목 블록 8개(≈7,500) → 1개(≈2,800): [TITLE] 실측 통계 17줄 제거, neoHook 블랙리스트·자가검토를 정본에 흡수, [홈판 모드 제목 필수 조건]·[원본 제목 활용]·homefeedClickContract·situationTitle 홈판 절을 병합, 길이 값 1종(§4-4) | §3-11 j | −4,700 |
| 4 | 첫 화면/구조 스펙 7개(MODE VOICE·GAMMA-7·SD·homefeed-90 첫 화면·상위노출 원칙·필수 구조 규칙·SITUATION DEPTH) → GAMMA-7 + FINAL CONTRACT 절충 한 줄 | §3-7 k, §4-5 | −3,200 |
| 5 | CTA "하나만" 6곳 → RETENTION 1곳 | §3-12 e | −700 |
| 6 | OFFICIAL OVERRIDE(영어) → 홈판 우선순위 4줄 | `official-exposure-rubric.prompt` | −2,300 |
| 7 | [HUMAN WRITING] 진짜 사람(base) + [섹션 첫 문장] 어미 4줄 + homefeed-90 말투 → HUMAN WRITING CONTRACT 에 흡수 | `homefeed/base.prompt:158-199`, `homefeed-90-quality.prompt:11-16` | −1,200 |
| 8 | 자가 점검 6개 → FINAL CHECK 1개 | §5-6 | −1,100 |
| 9 | [ANGLE] 소재 각도 기회지수 표(카테고리는 생성 전에 이미 정해짐) | `homefeed/base.prompt:53-71` | −500 |
| 10 | 소제목 규칙: [HEADINGS: 홈판] 정본, STRUCTURE 역할 목록·상위노출 5·필수 구조 규칙 headings 줄·[소제목 스타일 공통] 병합 | §3-15 | −700 |
| 11 | 날짜 규율 → dateBasis + 팩트 규율 4·5 | §4-11 | −700 |
| 12 | [표/체크리스트] 홈판 2줄만 | `contentJsonPromptFormat.ts:310-320` | −400 |
| 13 | STRUCTURE OVERRIDE "답이 밥이다" 8줄 (R0-5·최종 강제 1 중복) | `promptLoader.ts:1298-1305` | −450 |
| 14 | [1회 완성] + [최종 강제 조건] 1~3 + [참고 지표] 라벨 | 8-A 24~26 과 동일 | −900 |
| 15 | HT-2 타 모드 + ANGLE 예시 | 8-A 20~21 | −350 |
| 16 | 구분선(1,214)·버전 꼬리표·우선순위 선언 | §5-1 | −700 |
| | **합계** | | **≈ −20,200** |

→ 48,275 − 20,200 ≈ **28,100 자 (≈5.2:1 at 5.4K source)**. 4:1 에 닿으려면 (a) 홈판 system 을 카테고리 조건부로 더 쪼개 ≤21.5K 로 내리거나 (b) 자료 분모를 7K 이상으로 올려야 한다 — 이번 실행은 6/8 자료가 거부돼 rawChars 17.2K 중 5.4K 만 전달됐다(§6 마지막 행). 지시문 절감과 자료 보존을 같이 봐야 4:1 이 된다.

---

## 9. 프롬프트 문자열을 고정하는 테스트 (재핀 대상)

### 9-1. 바이트 단위 핀 (파일이 한 글자라도 바뀌면 실패)
- `docs/content-quality-v3/legacy-baseline.json` — `src/promptLoader.ts`, `src/contentJsonPromptFormat.ts`, `src/prompts/**/*.prompt` (seo/base, homefeed/base, shared/* 전부), `src/content/quality90Gate.ts`, evaluators 의 sha256. 검사: `src/__tests__/contentQualityLegacyBaseline.test.ts:23` ("pins every legacy prompt … byte"). 갱신: `scripts/legacy-baseline-pin.mjs`.
- `src/contentQualityV3/candidateRuntimeFingerprint.ts:147-620` — 위 파일 + `content/evidenceIntegrity.ts:166`, `factDisciplineGuard.ts:170`, `homefeedExposurePattern.ts:186`, `neoHookTitles.ts:202`, `situationDepthContract.ts:235`, `situationTitleContract.ts:236`, `sourceDocumentRender.ts:238`, `contentVoiceProfile.ts:403`, `geminiCostOptimizer.ts:436`, `promptSplitter.ts:511`, `blueprint/*:147,151`. 검사: `contentQualityV3RuntimeFingerprint.test.ts`, `fingerprintConsistency.test.ts`, `fingerprintPinToolWiring.test.ts`, `contentQualityV3ReleaseActivation*.test.ts`, `contentQualityV3EvidenceAttestation.test.ts`. 갱신: `npm run fingerprint:pin` (`scripts/fingerprint-pin.mjs`). 메모리 주의: CRLF 워크트리에서는 지문이 달라진다 — 메인 트리에서만 재계산.

### 9-2. 문자열 단언 테스트 (`toContain`/`toMatch`/`not.toContain`) — 파일별 건수와 읽는 소스
| 테스트 | 단언 수 | 읽는 소스 |
|---|---|---|
| `basePromptSelfConsistency.test.ts` | 15 | seo/base, seo/geo-overlay, shared/situation-depth |
| `promptHarnessConflicts.test.ts` | 22 | promptLoader, seo/base, exposure-structure, fact-brief-header, issue-brief-structure |
| `seoHomefeedPromptConflict.test.ts` | 20 | homefeed/base, homefeed/living, homefeed/travel, homefeedExposurePattern, promptLoader, seo/ai-tab-friendly, seo/base, homefeed-90-quality |
| `contentModePromptContracts.test.ts` | 67 | contentJsonPromptFormat, homefeed/base, promptLoader, seo/base, homefeed-90, mate-90, official-exposure-rubric, seo-90 |
| `p0QualityRecovery.test.ts` | 72 | contentJsonPromptFormat, promptLoader, seo/base, seo/geo-overlay |
| `attributionContract.test.ts` | 14 | contentJsonPromptFormat, homefeed/base, seo/base, exposure-structure, human-writing-anti-pattern |
| `judgmentFirstPersonContract.test.ts` | 19 | evidenceIntegrity, homefeed/base, seo/base, human-writing-anti-pattern |
| `fabricationMandateContract.test.ts` | 22 | homefeed/travel, promptLoader, seo/base, fact-brief-header |
| `headingModeSpec.test.ts` | 27 | homefeed/base, promptLoader, seo/base, headings-homefeed, headings-seo, strong-headings |
| `seoIssueBriefSkeleton.test.ts` | 44 | promptLoader, seo/base, fact-brief-header, issue-brief-structure |
| `situationTitleContract.test.ts` | 52 | contentJsonPromptFormat, evidenceIntegrity, homefeed/issue-story, neoHookTitles, seo/base, situationTitleContract |
| `tonePersonaNaturalness.test.ts` | 42 | homefeed/base, promptLoader, seo/base |
| `humanVoicePalette.test.ts` | 18 | contentJsonPromptFormat, contentVoiceProfile, promptLoader, human-writing-anti-pattern |
| `endingMixContract.test.ts` | 14 | promptLoader, human-writing-anti-pattern |
| `hashtagStrategy.test.ts` | 20 | promptLoader, hashtag-strategy |
| `readerAngles.test.ts` | 21 | promptLoader (reader-angles 배선) |
| `verifyPreviousWork.test.ts` | 11 | homefeed/base, seo/base, human-writing-anti-pattern, strong-headings |
| `promptSlimSelfCheck.test.ts` | 8 | seo/base |
| `keywordFrontPlacementOption.test.ts` | 9 | evidenceIntegrity, seo/base |
| `viewingExperienceAllowed.test.ts` | — | human-writing-anti-pattern §4 시청·관람 |
| `titlePayoffAndPersuasion.test.ts` | 26 | evidenceIntegrity, homefeed/base, neoHookTitles |
| `homefeedExposurePattern.test.ts` | 18 | homefeedExposurePattern |
| `homefeedTitleClickReason.test.ts` | 39 | contentJsonPromptFormat |
| `preWritingAnalysisAllModes.test.ts` / `modeTitleReasoningContracts.test.ts` / `issueTitleReasoningFirst.test.ts` | 37 / 24 / 16 | contentJsonPromptFormat |
| `summaryTable.test.ts` / `summaryTableToggle.test.ts` / `summaryTableDiscipline.test.ts` | 16 / 29 / 5 | fact-brief-header, contentJsonPromptFormat |
| `lengthContractSingleSource.test.ts` / `titleLengthPolicy.test.ts` | 14 / 5 | contentJsonPromptFormat (titleLengthPolicy) |
| `situationDepthContract.test.ts` | 23 | situationDepthContract |
| `factDisciplineGuard.test.ts` | 13 | factDisciplineGuard |
| `sourceDocumentPipeline.test.ts` | 20 | sourceDocumentRender (번호표 안내 문구) |
| `seoHomefeedIntegrity.test.ts` / `quality90Gate.test.ts` / `qualityEvaluator.test.ts` | 22 / 17 / 9 | evidenceIntegrity |
| `geminiCostOptimizer.test.ts` / `contentGenerationTimeoutPolicy.test.ts` | 33 / 140 | geminiCostOptimizer (1회 완성 계약 문구 포함) |
| `bodyPromptDateContext.test.ts` / `sourceFreshnessLabels.test.ts` | 24 / 18 | contentJsonPromptFormat (todayIs·최종 강제 7~8) |
| `finalVerdictContract.test.ts` / `evidenceQuoteField.test.ts` / `surprisingFactField.test.ts` / `internalJudgmentNotNarrated.test.ts` | 19 / 7 / 7 / 15 | contentJsonPromptFormat |
| `headingStyleConflict.test.ts` / `headingTitleStyleGuard.test.ts` | 7 / 14 | contentJsonPromptFormat |
| `structureMarkerSanitizer.test.ts` / `perSectionTemplateForce.test.ts` / `noLengthPressure.test.ts` | 9 / 5 / 5 | promptLoader (STRUCTURE OVERRIDE) |
| `hookIntroThreeLines.test.ts` / `exposedStructureWiring.test.ts` / `contentSourceDensityLevers.test.ts` | 19 / 19 / 22 | promptLoader |
| `homefeedIssueStorySkeleton.test.ts` / `homefeedIssueStoryContractExclusion.test.ts` / `homefeedIssueHint.test.ts` | 22 / 15 / 3 | promptLoader, issue-story, evidenceIntegrity, situationTitleContract |
| `contentBlueprint.test.ts` / `contentBlueprintRender.test.ts` / `contentBlueprintInsert.test.ts` | 26 / — / — | homefeed/base, renderBlueprintMaterial, promptSplitter |
| `titleEmotionSceneContract.test.ts` / `seoTitleQueryTailDigestion.test.ts` / `titleModeObjective.test.ts` / `titleCandidateSelection.test.ts` | 20 / 12 / 21 / 21 | situationTitleContract, contentJsonPromptFormat |
| `contentQualityV3Prompt.test.ts` / `contentQualityV3GenerationIntegration.test.ts` | — | promptSplitter 경계·마커 |
| `businessBasePromptContract.test.ts:68` | — | "[원본 텍스트] 마커 — 유일 + 문두" (마커 이동 시 실패) |

특히 주의할 소스-텍스트 단언(회귀 박제 함정, 메모리 "틀린 테스트가 회귀 강제"): `promptHarnessConflicts`·`basePromptSelfConsistency`·`seoHomefeedPromptConflict` 는 "A 블록이 B 문장을 포함하지 않는다/포함한다" 를 잡고 있어, 블록을 병합하면 **반대 방향의 단언**(예: ES-3 이 "3~6개" 를 말하지 않는다, base 에 "FAQ 3~6개" 가 없다)이 먼저 깨진다. 병합 전에 해당 테스트의 `not.toMatch` 목록을 읽고 정본 문구를 거기에 맞추는 편이 재핀 횟수를 줄인다.

### 9-3. 게이트 순서
1. `.prompt` / TS 문구 변경 → 2. 위 vitest 파일 개별 실행(`npx vitest run src/__tests__/<file>`) → 3. `scripts/legacy-baseline-pin.mjs` → 4. `npm run fingerprint:pin` (메인 트리, LF) → 5. `contentQualityLegacyBaseline`·`contentQualityV3RuntimeFingerprint`·`fingerprintConsistency` 재실행. 라이브 검증은 `generation-runs/*/C-final-prompt.txt` 에 이 스크립트를 다시 돌려 §1 표와 비교한다.

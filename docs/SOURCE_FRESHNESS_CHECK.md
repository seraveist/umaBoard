> 2026-10-02 수집 설계·조사 기록입니다. 현재 구현과 예약 실행 상태는 README.md와 SOURCE_SYNC_DESIGN.md를 따릅니다. 수집·정규화·검증은 구현됐고 실전 계산은 검증 대기입니다.

# UMA PLAN 최신 데이터 소스 점검

기준일: 2026-10-02 / 일본 서버. 공개 파일을 직접 내려받아 ID와 필드를 검사하고 공식 최근 변경 항목을 대조했다. 최신 전체 커버리지나 마신 계산식을 검증한 결과는 아니다.

## 1. 채택 판단

최신 스킬·캐릭터·서포트는 UmaTools를 주 수집원으로 유지한다. 일반 계승형과 각성 단계는 xancia/umasim/Tsuyuchan 자료로 보완할 수 있다. 각성은 현재 해방 가능한 MAX로 고정한다. 최신 인자 목록과 트레센켄 획득 경로도 추가 확보했다. 인자 목록과 ID 매핑은 참고 자료이며 현재 추천 기능의 필수 의존성이 아니다. 인자로 준비할 스킬은 스킬 DB에서 직접 추천한다. 롱샹 1000m·1400m의 지형 공백은 실제 챔미 지원 범위와 분리한다.

| 소스 | 실제 확인 날짜 | 사용 범위 | 한계 |
| --- | --- | --- | --- |
| [daftuyda/UmaTools](https://github.com/daftuyda/UmaTools) | 2026-10-02 11:02 JST | 스킬·의상·서포트·획득 경로의 주 수집원 | GameTora 파생 자료. 일반 계승 3종과 각성 단계 구분 보완 필요. |
| [mee1080/umasim](https://github.com/mee1080/umasim) | 2026-09-30 19:23 JST | 효과·조건 교차 검증과 일반 계승 보완 | 검사한 스킬 파일은 2,133개. 주 수집원에만 있는 61개 ID가 있어 전체 DB 대체용으로 사용하지 않음. |
| [xancia/NewmaMusumeAPI](https://github.com/xancia/NewmaMusumeAPI) | 2026-09-30 11:36 JST | JP 스킬·의상·카드·인자 목록의 보조 수집원 | 인자→계승 힌트 스킬 ID 연결은 없으나 현재 스킬 추천에는 불필요. 카드 이벤트는 제목 목록이며 보상 스킬 없음. 캐릭터 startDate에 자리표시자 값이 있어 출시 판정에 사용하지 않음. |
| [Tsuyuchan-jp/umamusume-data](https://github.com/Tsuyuchan-jp/umamusume-data) | 2026-09-30 13:03 JST (manifest generatedAt) | 각성 단계와 트레센켄 획득 경로의 보완 후보 | 서포트 45개만 제공. 스킬은 효과·지속시간 원문을 보존하지 않음. 코스 140개는 목록 정보. 시나리오는 트레센켄 1종이며 일부 달성 가정 포함. |
| [GameTora](https://gametora.com/data/manifests/umamusume.json) | 2026-10-02 manifest 확인; 원본 기준일 미제공 | 상위 원본과 추가 데이터 경로의 후보 | manifest에 factors·scenarios·scenario_factors·champions-meeting 확인. 이번 환경에서 해당 상세 JSON 자동 취득은 실패해 내용·범위 미검증. |
| [alpha123/uma-skill-tools](https://github.com/alpha123/uma-skill-tools) | 코스 파일 2026-02-24 15:52 JST; 10/2 현재 파일과 해시 일치 | 상세 코스 지형의 기존 수집원 | 138개 상세 코스. 목록에만 있는 롱샹 1000m·1400m 2개는 없음. 9/30 신규 스킬의 최신 수집원으로는 사용하지 않음. |
| [SimpleSandman 원본 아카이브](https://github.com/SimpleSandman/UmaMusumeMetaMasterMDB) | master 내용 2025-10-09 | 과거 스키마·연결 검사 전용 | 저장소 갱신일과 원본 데이터 날짜가 다름. 최신 JP 원본으로 제외. |
| [mikumifa/uma-tools](https://github.com/mikumifa/uma-tools) | jp-master.mdb 커밋 2026-02-13 14:36 JST | 과거 JP 원본 후보 | 저장소가 9월에 갱신되어도 JP MDB는 2월 커밋. 최신 원본으로 제외. MDB 내용은 이번에 다운로드·검사하지 않음. |

## 2. 최신 변경 반영 대조

| 검사 항목 | 게임 ID | 직접 확인한 결과 |
| --- | --- | --- |
| 9/30 신규 의상 | 101703, 101803 | UmaTools·xancia·Tsuyuchan에서 모두 확인. 고유·각성·진화 스킬은 UmaTools에서 연결 확인. |
| 9/30 신규 SSR | 30319, 30320 | UmaTools·xancia에서 모두 확인. 힌트 및 금·흰 이벤트 스킬 경로는 UmaTools에서 확인. |
| 9/30 맥퀸 밸런스 변경 | 100131, 900131, 101301111, 101301211 | UmaTools·umasim·xancia에서 변경된 발동 조건 확인. 각성6/7 여부와 무관하게 적용되는 기존 스킬 조정. |
| 10/1 히시 미라클 진화 추가 | 110602121 | ミラクル、起きるかも？의 ID·2200m 조건·효과·지속시간·원본 관계를 UmaTools에서 확인. umasim·xancia에도 존재. 수록일이 해방일보다 빠를 수 있음. |
| 일반 계승형 3종 | 901351, 901411, 911091 | UmaTools의 2,191개 고유 ID에는 없음. xancia·umasim에서 모두 확인. xancia 전체 2,194개와 UmaTools의 차이는 이 3개. |
| 각성6/7 구분 | 101301 | xancia potentialSkills.needRank와 Tsuyuchan skillsByAwakening으로 단계 구분 가능. 저장한 미래/미해방 항목과 현재 획득 가능 항목을 구분해야 함. |

## 3. 흰 인자 추천의 범위 확정

흰 인자 탭의 결과물은 ‘인자로 준비할 스킬 TOP 10’이다. 스킬 한 개를 추천·선택 단위로 사용하고, 일반 흰 스킬은 인자로 준비할 수 있는 기본 후보로 취급한다. 인자 클래스나 실제 부모 개체를 검색하지 않는다.

필수 데이터는 최신 스킬 ID·일본어 이름·희귀도/종류·효과·발동 조건, 상위·하위 관계, 본체·서포트·시나리오 획득 경로다. 현재 편성에서 일반 경로로 얻지 못하고 목표 레이스에 유효한 흰 스킬을 골라 추가·제외 마신으로 정렬한다. 체크 시 동일한 스킬 ID를 습득 가정에 넣어 가속 추천과 스태미나 결과를 재계산한다.

xancia의 최신 인자 목록과 과거 succession_factor/succession_factor_effect 연결 검사는 참고 조사로 보존한다. FactorMaster·FactorSkillLink 미확보는 출시 차단 사유가 아니다. 별도 인자 ID 대응 미확인 때문에 흰 스킬 후보를 제외하지 않는다. 효과·조건 미지원 여부의 검증은 계속 필요하다.

이전에 필수 요건으로 제시한 인자 ID→스킬 ID 매핑과 ‘생성·계승 기간’ 검증은 현재 목표에 불필요하므로 제거한다. 인자 ID·별수·생성/계승 확률·기간·레이스/시나리오 인자 클래스·부모 개체·프렌드 자료는 이 추천 기능의 수집 범위에 넣지 않는다.

일반 스킬 인자가 일반 희귀도 스킬에 대응한다는 기본 메커니즘은 [GameTora의 계승 설명](https://gametora.com/umamusume/legacies)의 White spark 항목과 부합한다. 인자 생성 확률·할인·실제 계승 결과를 계산하는 도구로 범위를 확장하지 않는다.

## 4. 각성·출시·밸런스 구분

- 각성은 현재 해방 가능한 MAX로 고정한다. 해당 의상에 출시된 6·7단계 스킬도 기본 습득 후보에 포함한다. 각성 입력은 없고 개화만 입력한다.
- 단계 구분은 xancia potentialSkills.needRank와 Tsuyuchan skillsByAwakening을 보완 근거로 쓴다. 최대 단계를 전역 상수 5나 7로 제한하지 않고 의상별 현재 해방 여부를 확인한다.
- 사전 데이터에 미래 추가 스킬이 들어 있을 수 있다. 존재와 출시·해방 가능 여부를 분리한다. 9/30 파일에 10/1 히시 미라클 진화가 수록된 사례를 확인했다.
- xancia 캐릭터 startDate는 최신 의상에서도 2016년 자리표시자 값이므로 출시일의 근거로 사용할 수 없다.
- 공식 공지는 맥퀸 기존 고유·계승·진화의 9/30 조정이 각성6/7 여부와 무관하게 적용된다고 명시한다. 각성 MAX 정책에도 JP 최신 효과를 적용한다.
- 고유기의 육성 중 레벨 상승 조건은 달성했다고 가정하고 개화 상태에 따른 최종 레벨을 적용한다. 진화 가능한 스킬은 진화형을 기본으로 하되 배타 분기와 교체 관계는 유지한다.

## 5. 트레센켄과 서포트 이벤트

Tsuyuchan의 트레센켄 자료는 링크 대상 ID와 제공 스킬 ID, 라멘 선택지의 배타 관계를 제공한다. 다만 대성황 등 일부 결과를 달성했다고 가정한 자료다. 원본 획득 경로와 달성 가정을 분리하고 링크/선택 제한을 보존한다. 전체 시나리오 DB나 진화 제한의 완전한 자료로 간주하지 않는다.

xancia의 서포트 파일은 힌트 스킬과 이벤트 제목을 제공하지만 이벤트 보상 스킬은 제공하지 않는다. 이벤트 스킬 경로는 UmaTools의 sup_e를 사용한다. 이벤트 완주·선택·성공 조건이 추천 후보에 영향을 주지 않는 기존 정책은 유지한다.

## 6. 코스와 계산 지원

2026-10-02 현재 alpha의 공개 course_data.json을 다시 내려받아 검사한 파일과 동일한 SHA-256임을 확인했다. 해당 공개 소스의 최신 파일은 확보했지만, 게임 내부 모든 코스 자산의 최종·완전한 자료라는 의미는 아니다. 게임 버전과 최신 원본 자산을 대조하기 전까지 전체 커버리지를 확정하지 않는다.

Tsuyuchan 목록은 140개, alpha의 상세 지형은 138개다. 차이는 롱샹 1000m(11201)·1400m(11202)이다. 두 ID는 과거 원본에도 있으므로 새로 추가된 코스라고 판단하지 않는다. U-tools의 해당 두 코스 페이지에는 코스 구성과 사용 레이스 목록이 비어 있으며 확인한 공개 챔미 개최 이력에도 없다. 목록의 존재만으로 실제 레이스 사용·챔미 지원이 필요하다고 판단하지 않는다.

| 코스 | 상세 지형 | 실제 사용 확인 | 초기 처리 |
| --- | --- | --- | --- |
| 롱샹 1000m / 11201 | alpha에 없음; U-tools 코스 구성도 비어 있음 | 확인한 공개 챔미 이력에는 없음 | 목록 보존, 계산 선택 제외 |
| 롱샹 1400m / 11202 | alpha에 없음; U-tools 코스 구성도 비어 있음 | 확인한 공개 챔미 이력에는 없음 | 목록 보존, 계산 선택 제외 |
| 롱샹 2400m / 11203 | alpha와 U-tools 상세 구간 있음 | 2026년 9월 공식 챔미 개최 확인 | 상세 구간 검증 후 지원 |

따라서 1000m·1400m의 부재는 현재 확인한 챔미 준비용 초기 구현의 필수 차단 사유가 아니다. ‘한 번도 사용되지 않았다’고 확정하지는 않는다. 공식 개최 프리셋이 실제로 요구하는 코스 ID를 상세 지형과 대조하여 지원 여부를 결정하고, 138개 모두를 무조건 검증 완료로 표시하지 않는다. 목록만으로 코너·경사를 추정하지 않는다.

새 스킬의 원본 효과 코드도 보존한다. 예를 들어 신규 루돌프 진화에는 type=48 효과가 포함되며, umasim은 fullSpurtAcceleration으로 구분한다. 최신 ID가 있다고 해서 이를 기존 일반 가속과 같은 계산 규칙으로 처리하지 않는다. 효과·발동 변수별 계산 지원 검증은 별도다.

## 7. 갱신 판정

1. 파일 커밋·해시·manifest 생성일과 원본 게임 버전을 각각 보관한다. 이번 자료들의 게임 버전은 확인되지 않아 null로 유지한다.
2. 최신 공식 출시/밸런스 공지의 대상 ID를 자동 갱신 후 대조한다. 저장소 push 날짜만으로 최신 판정을 내리지 않는다.
3. UmaTools와 GameTora는 원본/파생 관계라 독립된 두 검증원으로 세지 않는다. Tsuyuchan의 트레센켄 자료도 umasim 메모를 바탕으로 한다.
4. 자료가 최신이어도 지원 카드가 45개뿐이거나 필드를 단순화한 소스는 해당 보완 범위로만 사용한다.
5. 준비된 데이터 묶음의 관계·조건·지원 코드 검사를 통과한 후 활성화한다. 미확인 원본 기간·효과를 최신 날짜만 보고 추정하지 않는다.

## 8. 아직 남은 데이터 공백

- 일반 흰 스킬의 분류·상위/하위 관계·효과/조건 계산 지원. 별도 인자 DB·ID 매핑·생성/계승 확률과 기간은 필수 요건이 아니다.
- 일반/진화 계승의 전체 준비 조건 및 시나리오 진화 제한.
- 최신 전체 시나리오와 실제 목표 이벤트에 필요한 상세 코스 지형·프리셋 검증. 목록에만 있는 미사용 코스를 초기 지원의 필수 요건으로 삼지 않는다.
- 모든 최신 효과·조건과 능력치/스태미나 계산 규칙의 구현·검증.

GameTora의 공개 manifest에는 factors, scenarios, static/scenario_factors, events/champions-meeting 경로가 있다. 이번 환경에서 해당 상세 JSON을 자동 취득하지 못했으므로 내용을 확인한 소스로 승격하지 않았다. GitHub API의 무인증 요청 제한으로 일부 파일의 커밋은 공개 파일 이력 페이지를 확인했다.

## 출처와 검사 기록

- [9/30 신규 캐릭터·서포트 공식 공지](https://umamusume.jp/news/detail?id=3468)
- [9/30 맥퀸 각성6/7 및 기존 스킬 밸런스 공식 공지](https://umamusume.jp/news/detail?id=3478)
- [10/1 히시 미라클 진화 추가 예고 공식 공지](https://umamusume.jp/news/detail?id=3479)
- [UmaTools 데이터 관리 설명](https://github.com/daftuyda/UmaTools/blob/main/README.md)
- [xancia JP 공개 파일](https://github.com/xancia/NewmaMusumeAPI/tree/9e08a65a6d3cdfbfc838db8c5aa2cfe94180daef/latest-data-jp)
- [xancia 인자 파일 갱신 이력](https://github.com/xancia/NewmaMusumeAPI/commits/main/latest-data-jp/TerumiFactorData.json)
- [Tsuyuchan datasetVersion 0.1.12 manifest](https://github.com/Tsuyuchan-jp/umamusume-data/blob/51b809ec3e5657450af8c518d4d5603d4332b7ef/manifest.json)
- [GameTora manifest](https://gametora.com/data/manifests/umamusume.json)
- [alpha 상세 코스 파일 갱신 이력](https://github.com/alpha123/uma-skill-tools/commits/master/data/course_data.json)
- [umasim 스킬 파일 갱신 이력](https://github.com/mee1080/umasim/commits/main/data/skill_data.txt)
- [U-tools 롱샹 1000m](https://xn--gck1f423k.xn--1bvt37a.tools/race/courses/11201)
- [U-tools 롱샹 1400m](https://xn--gck1f423k.xn--1bvt37a.tools/race/courses/11202)
- [U-tools 롱샹 2400m](https://xn--gck1f423k.xn--1bvt37a.tools/race/courses/11203)
- [공개 챔미·LoH 개최 목록](https://design.u-ma.org/events)
- [2026년 9월 롱샹 2400m 챔미 공식 공지](https://dmg.umamusume.jp/news/detail/?id=3464)
- [인자 날짜와 효과 연결을 직접 검사한 과거 MDB](https://github.com/SimpleSandman/UmaMusumeMetaMasterMDB/blob/5a8ec1356859a35e245edef0d40da740e652df68/master/master.mdb)

직접 내려받은 파일의 해시, 수록 수, 점검한 ID는 data/latest-source-audit.json에 기록했다. 원본 파일·MDB·이미지는 프로젝트 ZIP에 재배포하지 않는다.

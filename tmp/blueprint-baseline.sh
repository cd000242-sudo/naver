#!/usr/bin/env bash
# SPEC-BLUEPRINT-2026 Phase 0 — 기준선 배치. 홈판 8편 + SEO 8편, GPT-5.6 Terra, 진단 로그 ON.
# 사용: bash tmp/blueprint-baseline.sh <batch-tag>
set -u
cd "c:/Users/박성현/Desktop/리더 네이버 자동화"
TAG="${1:-baseline}"
OUT="tmp/one-article/batch-$TAG"
mkdir -p "$OUT"
SRC="/c/Users/박성현/AppData/Roaming/better-life-naver"
DST="$PWD/tmp/one-article-userdata"
mkdir -p "$DST"
# [2026-09-04] 버전 업그레이드 wipe 가 .last_active_user 와 settings_<id>.json 을 지운다(설계된 동작).
#   활성 사용자 표시가 없으면 드라이버 안의 앱이 기본 계정으로 떨어져 키를 못 읽는다 —
#   자료 0자로 글을 써서 비교가 무의미해진다. 있는 것만 복사하고, 표시가 없으면 만들어 준다.
for f in config.json blog-accounts.json "Local State" .last_active_user .last-version settings.json; do
  [ -e "$SRC/$f" ] && cp "$SRC/$f" "$DST/"
done
cp "$SRC"/settings_*.json "$DST/" 2>/dev/null
if [ ! -s "$DST/.last_active_user" ]; then
  one=$(ls "$DST"/settings_*.json 2>/dev/null | head -1)
  if [ -n "$one" ]; then
    basename "$one" | sed -e 's/^settings_//' -e 's/\.json$//' > "$DST/.last_active_user"
    echo "[batch] .last_active_user 복원: $(cat "$DST/.last_active_user")"
  fi
fi
if [ ! -s "$DST/.last_active_user" ]; then echo "[batch] ⚠️ 활성 계정을 정할 수 없다 — 키 없이 돌면 비교가 무의미하다"; exit 1; fi
unset ELECTRON_RUN_AS_NODE
export OPENAI_DIAGNOSTICS=1
export BLUEPRINT_DEBUG=1
run() {
  local mode="$1" kw="$2" i="$3"
  local log="$OUT/$mode-$i.log"
  local before=$(ls -d tmp/one-article/2026* 2>/dev/null | wc -l)
  ONE_ARTICLE_USERDATA="$DST" ONE_ARTICLE_INPUT="$kw" ONE_ARTICLE_PROVIDER=openai ONE_ARTICLE_MODEL=openai-gpt41 \
    npx electron tmp/one-article-shopping.cjs "$kw" "$mode" > "$log" 2>&1
  local code=$?
  local folder=$(grep -o 'one-article\\[0-9T:-]*Z' "$log" | tail -1 | sed 's/.*\\//')
  echo "$mode|$i|$kw|exit=$code|folder=$folder" >> "$OUT/index.txt"
  echo "== $mode #$i ($kw) exit=$code folder=$folder"
}
HOMEFEED=("용혜인 언더조직 논란" "전세 계약 전 확인할 것" "추석 기차표 예매 방법" "에어컨 전기요금 절약" "청년월세지원 신청 자격" "중고차 살 때 확인 사항" "국민연금 수령 나이 변경" "겨울 난방비 절약 방법")
SEO=("청년도약계좌 가입조건" "환절기 비염 관리법" "9월 꽃구경 국내여행지" "전세보증보험 가입조건" "김치속 만들기 재료" "겨울 이불 세탁법" "연말정산 미리보기 방법" "자동차세 연납 신청")
i=0; for kw in "${HOMEFEED[@]}"; do i=$((i+1)); run homefeed "$kw" "$i"; done
i=0; for kw in "${SEO[@]}"; do i=$((i+1)); run seo "$kw" "$i"; done
rm -rf "$DST"
echo "BATCH DONE $(date '+%H:%M:%S')"

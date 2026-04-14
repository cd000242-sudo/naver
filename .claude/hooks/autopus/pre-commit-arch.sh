#!/bin/sh
# pre-commit-arch.sh — 아키텍처 규칙 검사
# Autopus-ADK가 자동 생성한 파일입니다.
set -e

# ARCHITECTURE.md 존재 확인
if [ ! -f "ARCHITECTURE.md" ]; then
    echo "⚠️  ARCHITECTURE.md 파일이 없습니다."
    echo "   'auto init' 실행 또는 ARCHITECTURE.md 생성 후 진행하세요."
    # 파일이 없으면 경고만 표시 (차단하지 않음)
    exit 0
fi

# 금지된 의존성 패턴 확인
# ARCHITECTURE.md에서 Forbidden Dependencies 섹션 파싱
FORBIDDEN_SECTION=$(awk '/^## Forbidden Dependencies/,/^## /' ARCHITECTURE.md 2>/dev/null | grep "^-" || true)

if [ -z "$FORBIDDEN_SECTION" ]; then
    echo "✅ 아키텍처 규칙 검사 완료 (금지 패턴 없음)"
    exit 0
fi

# 변경된 Go 파일 목록
CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep "\.go$" || true)

if [ -z "$CHANGED_FILES" ]; then
    echo "✅ 아키텍처 규칙 검사 완료 (변경된 Go 파일 없음)"
    exit 0
fi

# autopus check 명령어로 정밀 검사 (설치된 경우)
if command -v auto > /dev/null 2>&1; then
    echo "🔍 아키텍처 규칙 검사 중..."
    if auto check --arch --quiet; then
        echo "✅ 아키텍처 규칙 검사 통과"
    else
        echo "❌ 아키텍처 규칙 위반이 발견되었습니다."
        echo "   'auto check --arch' 명령어로 상세 내용을 확인하세요."
        exit 1
    fi
else
    echo "✅ 아키텍처 규칙 검사 완료 (auto CLI 없음, 기본 검사)"
fi

exit 0

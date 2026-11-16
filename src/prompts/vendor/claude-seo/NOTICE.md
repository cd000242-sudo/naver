# claude-seo (third-party, MIT)

These files are an unmodified copy of two skills from the open-source **claude-seo** project.

- Project: https://github.com/AgriciDaniel/claude-seo
- Author: AgriciDaniel and contributors
- License: MIT (see `LICENSE` in this folder; the copyright notice must stay with these files)
- Copied from commit: `468ed5b0d9e3249394783710e54abb02837e326b` (2026-11-15)
- Files copied: `skills/seo-content/SKILL.md`, `skills/seo-geo/SKILL.md`

## How this app uses them

After a post is drafted with Claude Code, the app runs one review pass in which Claude Code checks the draft against
selected sections of these skill files (content quality / E-E-A-T, readability and structure, AI-citation readiness)
and repairs only what clearly fails. The app reads the sections straight from these files at run time; the skill
text itself is not edited. Parts of the skills that audit a whole website (crawling, schema, robots.txt, llms.txt,
scripts that need Python) are not used.

## Updating

Replace the two `SKILL.md` files with a newer copy from the project, update the commit above, and check that the
section headings the app looks for still exist (the app reports a missing heading in its log).

---

이 폴더는 공개 프로젝트 claude-seo(MIT 허가)의 스킬 파일 두 개를 고치지 않고 그대로 담은 것입니다.
앱은 클로드 코드로 글 초안을 만든 뒤, 이 파일의 일부 항목(콘텐츠 품질, 읽기 쉬움·구조, AI 검색 인용 준비도)을
기준으로 초안을 한 번 점검·보완합니다. 사이트 전체를 점검하는 부분은 쓰지 않습니다.

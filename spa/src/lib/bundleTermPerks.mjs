// What an All in one licence adds on top of the three apps, by term (owner, 2026-11-25):
// "올인원 1년 이상은 네이버 자동화툴 + orbit + leword + 확장앱 + 강의 + 시크릿 클래스 등 제가 운영하는 서비스를
//  모두 제공받으실 수 있습니다. 영구제는 + 오프라인입니다."
// The apps themselves are the product's own `features`; this file holds only what the longer terms add.

const YEAR_PERKS = Object.freeze(['확장 앱', '강의', '시크릿 클래스 · 1대1 원격']);
const LIFETIME_PERK = '오프라인 1대1 (직접 만나서)';

/** Extra chips of the bundle card for this term; [] for one month or an unknown term. Always a fresh array. */
export function bundleTermPerks(term) {
    if (term === 'yearly') return [...YEAR_PERKS];
    if (term === 'lifetime') return [...YEAR_PERKS, LIFETIME_PERK];
    return [];
}

/** One line under the chips for the term that does not carry the perks yet; '' otherwise. */
export function bundleTermNote(term) {
    return term === 'monthly' ? '1년 이상부터 확장 앱 · 강의 · 시크릿 클래스가 함께 제공됩니다' : '';
}

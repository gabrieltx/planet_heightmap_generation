// The fork's political layer, steps S2 and S4 (FORK.md): the nine cultures a continent can be given, and the names made
// in each one's style — for countries, continents, oceans and seas. Every name is INVENTED: put together from sounds
// and endings typical of the style, never taken from a list of real places, and a name that happens to match a real
// country is thrown back. Culture drives names only (FORK.md). Pure functions: the same seed gives the same names.

import { rngOf } from './countries.js';

/** The cultures, in the order the picker lists them (ids are saved: never renumber or rename them). */
export const CULTURES = [
    { id: 'weur', name: 'West European' }, { id: 'eeur', name: 'East European' }, { id: 'easia', name: 'East Asian' },
    { id: 'sasia', name: 'South Asian' }, { id: 'africa', name: 'African' }, { id: 'namer', name: 'North American' },
    { id: 'latam', name: 'Latin American' }, { id: 'oceania', name: 'Oceania' }, { id: 'meast', name: 'Middle Eastern' },
];
export const cultureName = (id) => CULTURES.find(c => c.id === id)?.name ?? '';

// Each style: `on`sets, `nu`clei and `co`das for its syllables (a blank among them: often none), how many syllables a
// stem has, the endings a country's and a continent's name take, and sometimes words set before or after.
const S = (s) => s.split(' ').map(x => (x === '_' ? '' : x));
const STYLES = {
    weur: { on: S('b br c d f fl g gr l m n p pr r s st t tr v w h _ _'), nu: S('a e i o u ai ou ea ie au'), co: S('n r l s nd rt rn m st _ _ _'), syl: [1, 2],
        country: S('ia land mark ony ain ance aria burg stria gau elle onne'), continent: S('ia a ica onia erra'), pre: [], post: [] },
    eeur: { on: S('b br d dr g gr k kr l m n p pr r s sl st t tr v vl z zd ch _'), nu: S('a e i o u ia ie'), co: S('v r n k l sk m sh _ _ _'), syl: [1, 2],
        country: S('ia ova avia stva sko ica ina grad enia uria ovia'), continent: S('ia ava ovia aria'), pre: [], post: [] },
    easia: { on: S('h j k l m n r s sh t y z ch ts w x q _'), nu: S('a e i o u ao ai ei ou ia uo'), co: S('n ng _ _ _ _'), syl: [2, 2, 2, 3],
        country: S('_ _ _ _ _ guo do'), continent: S('_ _ shu zhou'), pre: [], post: [], plain: true },
    sasia: { on: S('b bh d dh g j k kh l m n p r s sh t v y ch _'), nu: S('a a i u e o aa ee'), co: S('n r l m sh t nd _ _ _'), syl: [1, 2],
        country: S('stan desh pur abad nagar ia ara ala istan arta'), continent: S('avarta dvipa ia ara'), pre: [], post: [] },
    africa: { on: S('b d g k l m mb n nd ng nk s t w z zw ch sh y _'), nu: S('a a e i o u'), co: S('_ _ _ _ n m'), syl: [2, 3],
        country: S('_ _ a i ongo wana ali anda ia ambe'), continent: S('a ia ika anda'), pre: [], post: [], plain: true },
    namer: { on: S('b br c ch d f g h k l m n p r s sh st t w wh'), nu: S('a e i o u ee oo ay'), co: S('n r l s k nd rd _ _ _'), syl: [1, 2],
        country: S('ia land ota ana awa ton field ington ada ico'), continent: S('ia a ica ana'), pre: ['New '], post: [' Union', ' Federation', ' Commonwealth'] },
    latam: { on: S('b c d f g l m n p r s t v ch qu z gu tr br _'), nu: S('a e i o u ia io ue'), co: S('n r l s z _ _ _ _'), syl: [1, 2],
        country: S('ador uela ina ivia aguay embia ara illo anca ico aria'), continent: S('ia a ica ora'), pre: ['San ', 'Costa ', 'Nueva '], post: [] },
    oceania: { on: S('h k l m n p r t w ng wh v f _ _'), nu: S('a e i o u a a ai au oa ua'), co: S('_'), syl: [2, 3],
        country: S('_ _ nui loa tea roa iti ana'), continent: S('_ nui roa ana'), pre: [], post: [], plain: true },
    meast: { on: S('b d f h j k kh l m n q r s sh t z gh y _'), nu: S('a a i u e aa ee ou'), co: S('r n m l d sh b f _ _ _'), syl: [1, 2],
        country: S('stan iyah an ar abad istan ia ain ait oun'), continent: S('ia iyah an ara'), pre: ['Al-'], post: [] },
};

// Real countries (and a few that were): a made name that matches one is made again.
const REAL = new Set(('afghanistan albania algeria andorra angola argentina armenia australia austria azerbaijan bahamas bahrain bangladesh barbados belarus belgium belize ' +
    'benin bhutan bolivia bosnia botswana brazil brunei bulgaria burkina burundi cambodia cameroon canada chad chile china colombia comoros congo croatia cuba cyprus czechia ' +
    'denmark djibouti dominica ecuador egypt eritrea estonia eswatini ethiopia fiji finland france gabon gambia georgia germany ghana greece grenada guatemala guinea guyana haiti ' +
    'honduras hungary iceland india indonesia iran iraq ireland israel italy jamaica japan jordan kazakhstan kenya kiribati kosovo kuwait kyrgyzstan laos latvia lebanon lesotho ' +
    'liberia libya liechtenstein lithuania luxembourg madagascar malawi malaysia maldives mali malta mauritania mauritius mexico micronesia moldova monaco mongolia montenegro ' +
    'morocco mozambique myanmar namibia nauru nepal netherlands nicaragua niger nigeria norway oman pakistan palau palestine panama paraguay peru philippines poland portugal ' +
    'qatar romania russia rwanda samoa senegal serbia seychelles singapore slovakia slovenia somalia spain sudan suriname sweden switzerland syria taiwan tajikistan tanzania ' +
    'thailand togo tonga tunisia turkey turkmenistan tuvalu uganda ukraine uruguay uzbekistan vanuatu venezuela vietnam yemen zambia zimbabwe england scotland wales britain ' +
    'america korea persia siam burma ceylon prussia bohemia yugoslavia zaire rhodesia arabia africa asia europe oceania antarctica hawaii aotearoa texas alaska dakota').split(' '));

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const cap = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const VOWEL = /[aeiou]/;

/** A stem in a style: its syllables run together, no letter three times in a row, no vowel or consonant pile-ups. */
function stem(rng, st) {
    for (let tries = 0; tries < 20; tries++) {
        const count = pick(rng, st.syl);
        let s = '';
        for (let i = 0; i < count; i++) s += pick(rng, st.on) + pick(rng, st.nu) + (i === count - 1 || rng() < 0.3 ? pick(rng, st.co) : '');
        if (s.length < 3 || s.length > 9 || /(.)\1\1/.test(s) || /[^aeiou]{4}/.test(s) || /[aeiou]{3}/.test(s)) continue;
        return s;
    }
    return 'aran';
}
/** A stem and an ending joined: a vowel dropped where two would meet, so "Bela" + "ia" reads "Belia". */
function join(s, end) {
    if (!end) return s;
    if (VOWEL.test(s[s.length - 1]) && VOWEL.test(end[0])) { const cut = s.replace(/[aeiou]+$/, ''); s = cut.length >= 2 ? cut : s + 'n'; }
    if (s.endsWith('q')) s += 'u';
    if (s.endsWith('gu') || s.endsWith('qu')) { if (!VOWEL.test(end[0])) s += 'a'; }
    return s + end;
}

/**
 * A name in a culture's style. `kind`: 'country', 'continent', 'ocean' or 'sea'; `taken`: the names already used in this
 * world (lower case), added to.
 */
export function makeName(rng, culture, kind, taken) {
    const st = STYLES[culture] ?? STYLES.weur;
    for (let tries = 0; tries < 60; tries++) {
        let name;
        if (kind === 'country') {
            name = cap(join(stem(rng, st), pick(rng, st.country)));
            const r = rng();
            if (st.pre.length && r < 0.07) name = pick(rng, st.pre) + name;
            else if (st.post.length && r > 0.94) name += pick(rng, st.post);
        } else if (kind === 'continent') name = cap(join(stem(rng, st), pick(rng, st.continent)));
        else {
            // (the waters: named in English, after a word in the style of the nearest land)
            const word = cap(join(stem(rng, st), st.plain ? '' : pick(rng, ['', '', 'ian', 'ic', 'an'])));
            name = kind === 'ocean' ? `${word} Ocean` : rng() < 0.5 ? `${word} Sea` : `Sea of ${word}`;
        }
        const key = name.toLowerCase(), bare = key.replace(/^(new |san |costa |nueva |al-|sea of )/, '').replace(/ (ocean|sea|union|federation|commonwealth)$/, '');
        if (name.length < 4 || bare.length > 11 || /[^aeiou\s-]{4}/.test(bare) || REAL.has(bare) || REAL.has(key) || taken.has(key) || taken.has(bare)) continue;
        taken.add(key); taken.add(bare);
        return name;
    }
    return `${cap(stem(rng, st))} ${taken.size}`;
}

/**
 * Every name of a world. `F`: its lands; `P`: its countries (or null: none yet); `cultureOf(country)`: each country's
 * culture id; `continentCulture(k)`: each continent's first culture; `fixed`: the names the player wrote, by key
 * ('continent:2', 'sea:0', 'country:<its capital's cell>') — kept as they are; `salt`: raised to make the rest again.
 * @returns {{ continents: string[], seas: string[], countries: string[] }}
 */
export function makeNames(mesh, F, P, { seed = 1, salt = 0, cultureOf, continentCulture, fixed = {} }) {
    const taken = new Set(Object.values(fixed).map(s => String(s).toLowerCase()));
    const rngFor = (kind, id) => rngOf(((seed * 31 + salt * 7919) ^ (kind * 1000003 + id * 8191)) >>> 0);
    const dot = (a, b) => mesh.xyz[3 * a] * mesh.xyz[3 * b] + mesh.xyz[3 * a + 1] * mesh.xyz[3 * b + 1] + mesh.xyz[3 * a + 2] * mesh.xyz[3 * b + 2];
    const continents = F.continents.map(k => fixed[`continent:${k.id}`] ?? makeName(rngFor(1, k.id), continentCulture(k.id), 'continent', taken));
    const seas = F.seas.map(s => {
        if (fixed[`sea:${s.id}`]) return fixed[`sea:${s.id}`];
        // (after the continent whose middle is nearest its own)
        let near = 0, best = -2;
        for (const k of F.continents) { const d = dot(s.peak, k.peak); if (d > best) { best = d; near = k.id; } }
        return makeName(rngFor(2, s.id), continentCulture(near), s.kind, taken);
    });
    const countries = P ? P.countries.map(k => fixed[`country:${k.capital}`] ?? makeName(rngFor(3, k.capital), cultureOf(k), 'country', taken)) : [];
    return { continents, seas, countries };
}

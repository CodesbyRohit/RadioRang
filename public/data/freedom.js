/* 80 Years of Freedom — content data.
 *
 * Historical accuracy: dates and facts follow standard historical reference
 * (NCERT/ICHR accounts of the freedom movement). Quotes are drawn from
 * documented primary sources: Nehru's "Tryst with Destiny" speech (15 Aug
 * 1947, a government work now in the public domain in India), Gandhi's
 * writings as collected by Raghavan Iyer, Bose's INA address (1944), Patel's
 * public speeches, Bhagat Singh's writings, and Sarojini Naidu's published
 * speeches.
 */

/* ---------------------------------------------------------------- *
 *  Freedom movement timeline — 1857 to 1947
 * ---------------------------------------------------------------- */
export const TIMELINE = [
  {
    year: '1857',
    title: 'The First War of Independence',
    text: 'Sepoy regiments rise across north India; the first great uprising against British rule — Delhi, Kanpur, Lucknow, Jhansi. Though it falls, it plants the idea that the empire can be challenged.',
  },
  {
    year: '1885',
    title: 'The Indian National Congress is founded',
    text: 'Born in Bombay, the Congress becomes the political voice of a new Indian nationalism — petitioning, debating, and steadily demanding a greater share in ruling the country.',
  },
  {
    year: '1905',
    title: 'Partition of Bengal & the Swadeshi Movement',
    text: 'The British divide Bengal; Indians answer with the Swadeshi movement — boycotting British goods, reviving Indian industry, and kindling mass political consciousness.',
  },
  {
    year: '1919',
    title: 'Jallianwala Bagh',
    text: 'On 13 April, unarmed civilians gather in Amritsar to protest; General Dyer orders fire, killing hundreds. The massacre shatters faith in British justice and turns the movement decisively toward non-cooperation.',
  },
  {
    year: '1920',
    title: 'Non-Cooperation Movement',
    text: 'Gandhi launches his first mass satyagraha — surrender of titles, boycott of courts and schools. Millions join; the movement is called off after Chauri Chaura, but the scale of participation is a turning point.',
  },
  {
    year: '1930',
    title: 'The Dandi March & Salt Satyagraha',
    text: 'Gandhi walks 240 miles to the sea and breaks the salt law; civil disobedience sweeps the country. The British are forced to negotiate — the empire begins to bend.',
  },
  {
    year: '1942',
    title: 'Quit India',
    text: 'At the Bombay session, Gandhi gives the call: "Do or Die." Mass civil disobedience erupts; the entire Congress leadership is jailed — but the demand for freedom is now unanswerable.',
  },
  {
    year: '1947',
    title: 'Freedom at the Midnight Hour',
    text: 'On 15 August, India awakes to life and freedom. The tricolour rises over the Red Fort; Nehru speaks of a tryst with destiny. Eighty years on, that promise is still the nation\'s.',
  },
];

/* ---------------------------------------------------------------- *
 *  Freedom fighters
 * ---------------------------------------------------------------- */
export const FIGHTERS = [
  {
    name: 'Mahatma Gandhi',
    years: '1869–1948',
    role: 'Father of the Nation',
    text: 'Non-violent resistance as a weapon of the weak and the strong alike. Salt Satyagraha, Non-Cooperation, Quit India — he taught a people to be fearless without hate.',
    monogram: 'MK',
  },
  {
    name: 'Jawaharlal Nehru',
    years: '1889–1964',
    role: 'First Prime Minister',
    text: 'Architect of modern India\'s institutions — planning, science, democracy. His midnight speech on 15 August 1947 remains the nation\'s founding text.',
    monogram: 'JN',
  },
  {
    name: 'Sardar Vallabhbhai Patel',
    years: '1875–1950',
    role: 'The Iron Man',
    text: 'Unifier of India. As Deputy PM and Home Minister he integrated 565 princely states into one union — a nation welded together in a single stroke.',
    monogram: 'VP',
  },
  {
    name: 'Subhas Chandra Bose',
    years: '1897–1945',
    role: 'Netaji',
    text: 'Gave the movement its army. The Indian National Army carried the fight abroad; "Give me blood, and I shall give you freedom" still rings across the country.',
    monogram: 'SB',
  },
  {
    name: 'Bhagat Singh',
    years: '1907–1931',
    role: 'Revolutionary',
    text: 'Hanged at twenty-three for his part in the revolutionary struggle. His ideas outlived him: "They may kill me, but they cannot kill my ideas."',
    monogram: 'BS',
  },
  {
    name: 'Sarojini Naidu',
    years: '1879–1949',
    role: 'The Nightingale of India',
    text: 'Poet, orator, and the first Indian woman to preside over the Congress. Her words carried the movement to women and to the world.',
    monogram: 'SN',
  },
];

/* ---------------------------------------------------------------- *
 *  Verified quotes
 * ---------------------------------------------------------------- */
export const QUOTES = [
  {
    text: 'At the stroke of the midnight hour, when the world sleeps, India will awake to life and freedom.',
    source: 'Jawaharlal Nehru — Tryst with Destiny, 15 August 1947',
  },
  {
    text: 'Freedom is never dear at any price. It is the breath of life. What would a man not pay for living?',
    source: 'Mahatma Gandhi',
  },
  {
    text: 'Give me blood, and I shall give you freedom!',
    source: 'Subhas Chandra Bose — Address to the Indian National Army, 1944',
  },
  {
    text: 'There is something unique in this soil, which, despite many obstacles, has always remained the abode of great souls.',
    source: 'Sardar Vallabhbhai Patel',
  },
  {
    text: 'They may kill me, but they cannot kill my ideas.',
    source: 'Bhagat Singh',
  },
  {
    text: 'We want deeper sincerity of motive, a greater courage in speech and earnestness in action.',
    source: 'Sarojini Naidu',
  },
];

/* ---------------------------------------------------------------- *
 *  Tryst with Destiny — opening excerpts (public domain in India)
 * ---------------------------------------------------------------- */
export const TRYST = {
  heading: 'The Tryst with Destiny',
  speechTitle: 'Jawaharlal Nehru, Constituent Assembly, 14–15 August 1947',
  paragraphs: [
    'Long years ago we made a tryst with destiny, and now the time comes when we shall redeem our pledge, not wholly or in full measure, but very substantially. At the stroke of the midnight hour, when the world sleeps, India will awake to life and freedom.',
    'A moment comes, which comes but rarely in history, when we step out from the old to the new; when an age ends; and when the heart of a nation, long suppressed, finds utterance. It is fitting that at this solemn moment we take the pledge of dedication to the service of India and her people and to the still larger cause of humanity.',
  ],
  footnote: 'Excerpts from the midnight address of 15 August 1947. A government work of the Republic of India, now in the public domain.',
};

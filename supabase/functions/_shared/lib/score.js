// Tags every event and computes two scores:
//   social   0-100  how easy it is to meet people there (format, RSVPs, price, timing)
//   interest 0-100  soft match to the user's interests; never used to hide events
// Keyword lists are BG + EN and match title, categories and description.

const TAGS = {
  sport: /\b(run|running|marathon|5k|football|futsal|basketball|volleyball|tennis|padel|climb|boulder|hike|hiking|trail|cycling|bike|yoga|crossfit|hyrox|fitness|workout|gym|powerlifting|strongman|martial|boxing|swim|ski|sport)\w*|бяга|маратон|футбол|баскетбол|волейбол|тенис|катерен|планин|преход|колоездене|йога|фитнес|тренировк|спорт|пауърлифтинг|бокс/i,
  fitness: /\b(gym|strength|powerlifting|strongman|crossfit|hyrox|calisthenics|bodybuilding|fitness|workout)\w*|фитнес|силов|пауърлифтинг|културизъм/i,
  nightlife: /\b(party|parties|nightclub|club night|clubbing|dj|techno|house music|rave|nightlife|disco|afterparty|drum ?(&|and|n) ?bass|dnb|hip ?hop|r&b|reggaeton)\b|парти|купон|нощен клуб|клубна нощ|дискотек/i,
  music: /\b(concert|live|gig|band|jazz|rock|metal|punk|indie|acoustic|orchestra|festival|dj|music|tour)\b|концерт|джаз|рок|метъл|оркест|фестивал|музик|турне/i,
  dance: /\b(salsa|bachata|kizomba|tango|swing|lindy|zouk|dance|dancing)\w*|салса|бачата|кизомба|танго|танц/i,
  games: /\b(board ?games?|boardgame|magic|mtg|commander|warhammer|d&d|dungeons|tabletop|chess|quiz|trivia|poker|game night|esports|lan party|pok[eé]mon|lorcana)\b|настолн|шах|куиз|викторин|игри/i,
  geek: /\b(comic|comics|anime|manga|cosplay|fantasy|sci-?fi|star wars|tolkien|con\b|comic con|warhammer|d&d)\w*|комикс|аниме|фентъзи|фантаст/i,
  philosophy: /\b(philosoph|stoic|debate|ethics|socratic|existential|book club|reading club|literature)\w*|философ|дебат|етика|книжен клуб|литератур/i,
  business: /\b(business|startup|founder|entrepreneur|networking|investor|vc|marketing|sales|product|pitch|finance|financial|leadership|career)\w*|бизнес|стартъп|предприемач|нетуъркинг|инвеститор|маркетинг|кариер/i,
  tech: /\b(tech|ai|ml|python|javascript|developer|devops|cloud|aws|data|blockchain|crypto|web3|hackathon|coding|software|owasp|security)\b|програмир|технолог|хакатон/i,
  networking: /\b(networking|mixer|meetup|meet-up|social|connect|community|expats?|internationals?|afterwork|after work|happy hour)\b|нетуъркинг|запознан|общност|среща/i,
  language: /\b(language exchange|tandem|polyglot|english club|conversation club|speaking club)\b|езиков|разговорен клуб/i,
  comedy: /\b(stand-?up|comedy|improv|open mic|impro)\b|стендъп|комеди|импро/i,
  culture: /\b(theatre|theater|opera|ballet|exhibition|gallery|museum|cinema|film|screening|poetry|art)\b|театър|опера|балет|изложб|галери|музей|кино|филм|прожекц|поезия|изкуств/i,
  workshop: /\b(workshop|masterclass|class|course|lesson|seminar|training|bootcamp)\b|работилниц|уъркшоп|курс|семинар|обучение|урок/i,
  volunteering: /\b(volunteer|volunteering|charity|cleanup|clean-up|donation|shelter)\w*|доброволч|благотвор|дарител|почистван|приют/i,
  food: /\b(dinner|brunch|wine|beer|tasting|food|cooking|supper|cocktail)\w*|вечеря|вино|бира|дегустац|кулинар|готвене|коктейл/i,
  outdoors: /\b(hike|hiking|trail|mountain|vitosha|outdoor|picnic|camping|kayak)\w*|планин|витоша|преход|пикник|природ/i,
};

// Formats where you actively interact with strangers.
const PARTICIPATORY = new Set(['sport', 'dance', 'games', 'networking', 'language', 'workshop', 'volunteering', 'food', 'outdoors', 'philosophy']);
// Formats where you mostly sit and watch.
const PASSIVE = /\b(theatre|theater|opera|ballet|symphony|philharmonic|recital|cinema|screening|premiere)\b|театър|опера|балет|симфони|филхармони|рецитал|прожекц|премиера|спектакъл|постановка/i;

// Soft interest weights (from the user's profile). Deliberately modest so everything else still surfaces.
const INTERESTS = { fitness: 30, sport: 20, music: 15, nightlife: 15, philosophy: 25, games: 25, networking: 20, business: 20, geek: 25, tech: 10, comedy: 10, dance: 10, outdoors: 10 };

export function tagEvent(e) {
  // Title + source categories are reliable; long descriptions mention everything ("after the run we
  // party", "sponsored by a gym"), so they only count when the title says nothing.
  const titleCats = `${e.title} ${(e.categories ?? []).join(' ')}`;
  const strong = Object.entries(TAGS).filter(([, re]) => re.test(titleCats)).map(([n]) => n);
  if (strong.length) return strong;
  const desc = (e.description ?? '').slice(0, 600);
  return Object.entries(TAGS).filter(([n, re]) => n !== 'culture' && n !== 'music' && re.test(desc)).map(([n]) => n);
}

export function scoreEvent(e, tags) {
  let social = 30;
  const participatory = tags.filter((t) => PARTICIPATORY.has(t)).length;
  social += Math.min(participatory, 2) * 18;
  if (tags.includes('nightlife')) social += 12; // not participatory per se, but a mingling crowd
  if (tags.includes('comedy')) social += 5;
  if (PASSIVE.test(`${e.title} ${(e.categories ?? []).join(' ')}`)) social -= 20;
  if (e.attendees) social += Math.min(15, Math.round(Math.log10(e.attendees + 1) * 7));
  if (e.price?.free) social += 5;
  if (e.recurring) social += 5; // regulars = you see the same people again

  const local = new Date(e.start).toLocaleString('en-GB', { timeZone: 'Europe/Sofia', weekday: 'short', hour: '2-digit', hour12: false });
  const [dow, hour] = local.split(/,?\s+/); // "Sat, 10"
  const h = Number(hour);
  const weekend = dow === 'Sat' || dow === 'Sun' || (dow === 'Fri' && h >= 17);
  if (h >= 17 || weekend) social += 5;
  if (!weekend && h >= 9 && h < 17 && !e.recurring) social -= 10; // weekday office hours

  const interest = Math.min(100, tags.reduce((s, t) => s + (INTERESTS[t] ?? 0), 0));
  return { social: clamp(social), interest };
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

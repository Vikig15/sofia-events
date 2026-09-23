// Sofia Instagram accounts that announce upcoming events (used by connectors/instagram.js).
// Every handle was fetched on 2026-09-23 and had server-rendered posts; `active` notes how many of
// its latest 12 posts were < 21 days old that day (a rough "posts often" signal, not used in code).
//
// venue:    the account IS a place -> default venue for its posts (a "📍 ..." line in the caption wins).
//           null = organiser/promoter/community; venue comes from the caption or falls back to the name.
// category: becomes an event category (plus 'Instagram'), so use words lib/score.js TAGS understand.
//
// To add one: open https://www.instagram.com/<handle>/ logged out; it must show posts, not a login wall.

const V = (name, address = null, lat = null, lon = null) => ({ name, address, lat, lon });

export const INSTAGRAM_ACCOUNTS = [
  // ---- Clubs, bars, live venues ----
  { handle: 'carrusel_club', name: 'Carrusel Club', category: 'Nightlife club party', venue: V('Carrusel Club', 'ул. Г. С. Раковски 108, София') }, // active 12
  { handle: 'yaltaclub', name: 'Yalta Club', category: 'Nightlife club techno', venue: V('Yalta Club', 'бул. Цар Освободител 20, София') }, // 3
  { handle: 'yaltaclubsofia', name: 'Solar Festival Crew (Yalta)', category: 'Nightlife techno party', venue: null }, // 1
  { handle: 'bedroomclubsofia', name: 'Bedroom Club', category: 'Nightlife club party', venue: V('Bedroom Club') }, // 12
  { handle: 'barpetak', name: 'Бар Петък', category: 'Nightlife bar party', venue: V('Бар Петък') }, // 10
  { handle: 'fomo.the.club', name: 'FOMO the club', category: 'Nightlife club party', venue: V('FOMO the club', 'ул. Цар Калоян 6, София') }, // 10 (hosts "Secret Crush" Saturdays)
  { handle: 'clwd_space', name: 'CLWD', category: 'Nightlife club party', venue: V('CLWD') }, // 10
  { handle: 'culturebeatclub', name: 'Culture Beat', category: 'Nightlife club party', venue: V('Culture Beat', 'НДК, пл. България 1, София') }, // 11
  { handle: 'gramophone_club', name: 'Gramophone Live & Event Club', category: 'Nightlife live music party', venue: V('Gramophone Club') }, // 11
  { handle: 'clubmixtape5', name: 'Club Mixtape 5', category: 'Live music concert nightlife', venue: V('Mixtape 5') }, // 11
  { handle: 'kupe.sofia', name: 'K.U.P.E.', category: 'Nightlife techno party', venue: V('K.U.P.E.') }, // 10
  { handle: 'sofialiveclub', name: 'Sofia Live Club', category: 'Live music concert', venue: V('Sofia Live Club', 'пл. България 1, НДК (подлеза с фонтаните), София', 42.6862, 23.3192) }, // 7
  { handle: 'toplocentrala', name: 'Топлоцентрала', category: 'Culture live music', venue: V('Топлоцентрала') }, // 11
  { handle: 'bar_stage_toplocentrala', name: 'Bar Stage Toplocentrala', category: 'Live music bar', venue: V('Bar Stage, Топлоцентрала') }, // 7
  { handle: 'rocknrolla_bar_sofia', name: "Rock'N'Rolla", category: 'Live music rock bar', venue: V("Rock'N'Rolla Bar") }, // 12
  { handle: 'jjmurphysirishpub', name: "JJ Murphy's Irish Pub", category: 'Bar live music quiz', venue: V("JJ Murphy's Irish Pub") }, // 12
  { handle: 'inthemoodclub', name: 'In The Mood Jazz Club', category: 'Live music jazz', venue: V('In The Mood Jazz Club') }, // 10
  { handle: 'sinatra_sofia', name: 'Piano Bar Sinatra', category: 'Live music bar', venue: V('Piano Bar Sinatra') }, // 11
  { handle: 'barlocalsofia', name: 'Bar Local', category: 'Bar nightlife dj', venue: V('Bar Local') }, // 6
  { handle: 'swinginhall', name: "Swingin' Hall", category: 'Live music bar', venue: V("Swingin' Hall", 'бул. Драган Цанков 8, София') }, // 6
  { handle: 'chistilishteto', name: 'Чистилището', category: 'Live music bar', venue: V('Чистилището') }, // 1

  // ---- Promoters, party series, radio ----
  { handle: 'temperamento_events', name: 'Temperamento', category: 'Nightlife party dj', venue: null }, // 2
  { handle: 'offbeat.sofia', name: 'OFF BEAT Radio', category: 'Music dj party', venue: null }, // 11
  { handle: 'urban.gatherings', name: 'Urban Gatherings', category: 'Party dj community', venue: null }, // 3
  { handle: 'festteambg', name: 'Fest Team Bulgaria', category: 'Concert music festival', venue: null }, // 11
  { handle: 'innerverse.concept', name: 'Innerverse', category: 'Nightlife party dj', venue: null }, // 3
  { handle: 'blvkcat.world', name: 'BLVKCAT', category: 'Nightlife party dj', venue: null }, // 2
  { handle: 'cotton_candy.party', name: 'Cotton Candy', category: 'Nightlife party', venue: null }, // 6
  { handle: 'snrs_events', name: 'Sunrise Events', category: 'Nightlife techno party', venue: null }, // 4
  { handle: 'paknaparty', name: 'DJ Pak (Пак на парти)', category: 'Nightlife party dj', venue: null }, // 3
  { handle: 'detska.diskoteka', name: 'Детска дискотека', category: 'Nightlife party disco', venue: null }, // 1 (an adult party series)
  { handle: 'kpopeventsbg', name: 'Kpop Events BG', category: 'Party dance music', venue: null }, // 5
  { handle: 'anijambg', name: 'AniJam', category: 'Anime party music', venue: null }, // 12

  // ---- Quizzes ----
  { handle: 'sofiaquizmadness', name: 'Sofia Quiz Madness', category: 'Quiz', venue: null }, // 12
  { handle: 'quiznightbg', name: 'Quiz Night BG', category: 'Quiz', venue: null }, // 7
  { handle: 'golemiatquiz', name: 'Големият Quiz', category: 'Quiz', venue: null }, // 9

  // ---- Comedy / improv ----
  { handle: 'comedyclubsofia', name: 'Comedy Club Sofia', category: 'Comedy stand-up', venue: V('The Comedy Club Sofia') }, // 4
  { handle: 'hahahaimpro', name: 'HaHaHa Impro Theatre', category: 'Comedy improv', venue: null }, // 0 (season restarts in autumn)
  { handle: 'insidejokestandup', name: 'Inside Joke', category: 'Comedy stand-up open mic', venue: null }, // 2

  // ---- Running, fitness, climbing, outdoors ----
  { handle: 'sofiarunclub', name: 'Sofia Run Club', category: 'Running run club', venue: null }, // 8
  { handle: 'begachsofia', name: 'Begach Running Club', category: 'Running run club', venue: null }, // 9
  { handle: 'runlife_nutritionbar', name: 'RunLife Nutrition Bar', category: 'Running run club', venue: V('RunLife Nutrition Bar', 'бул. България, София') }, // 5
  { handle: 'marathon.sofia', name: 'Wizz Air Sofia Marathon', category: 'Running marathon', venue: null }, // 12
  { handle: 'padel_club_sofia', name: 'Padel Club Sofia', category: 'Padel sport', venue: V('Padel Club Sofia') }, // 11
  { handle: 'momentumclimbingsofia', name: 'Momentum Climbing', category: 'Climbing boulder', venue: V('Momentum Climbing Sofia') }, // 12
  { handle: 'crossfire.sofia', name: 'CrossFire', category: 'CrossFit fitness hyrox', venue: V('CrossFire Sofia') }, // 10
  { handle: 'crossfit681', name: 'CrossFit 681', category: 'CrossFit fitness', venue: V('CrossFit 681') }, // 3
  { handle: 'crossfitserdika', name: 'CrossFit Serdika', category: 'CrossFit fitness', venue: V('CrossFit Serdika') }, // 5
  { handle: 'ffbulgaria', name: 'Bulgarian Functional Fitness Association', category: 'CrossFit fitness competition', venue: null }, // 9
  { handle: 'adventureshopsofia', name: 'Adventure Shop', category: 'Outdoors hiking mountain', venue: V('Adventure Shop') }, // 2
  { handle: 'thesocialhikingclub', name: 'The Social Hiking Club', category: 'Hiking outdoors community', venue: null }, // 0

  // ---- Board games, TCG, anime/comics ----
  { handle: 'level.up.sofia', name: 'Level Up Board Game Club', category: 'Board games', venue: V('Level Up Board Game Club') }, // 2
  { handle: 'castle.boardgames', name: 'Другият замък', category: 'Board games Magic', venue: V('Другият замък', 'Полигона, бл. 43, София') }, // 2
  { handle: 'abordagebg', name: 'Abordage', category: 'Board games Magic', venue: V('Abordage') }, // 3
  { handle: 'moxgamesbg', name: 'Mox Games', category: 'Board games Magic', venue: V('Mox Games') }, // 1
  { handle: 'mulligan.games', name: 'Mulligan Games', category: 'Board games Magic', venue: V('Mulligan') }, // 5
  { handle: 'nakamabg', name: 'Nakama Bulgaria', category: 'Anime cosplay comics', venue: null }, // 3
  { handle: 'comiccon.bg', name: 'Aniventure Comic Con', category: 'Comic con anime cosplay', venue: null }, // 0 (annual, July)

  // ---- Community, social, students, books ----
  { handle: 'thebookclubsofia', name: 'The Book Club Sofia', category: 'Book club literature', venue: null }, // 6
  { handle: 'esnsofia', name: 'ESN Sofia', category: 'Community social internationals', venue: null }, // 8
  { handle: 'esnsofiauni', name: 'ESN Sofia University', category: 'Community social internationals', venue: null }, // 1
  { handle: 'togeda_net', name: 'Togeda', category: 'Community social meetup', venue: null }, // 10
  { handle: 'singlesofsofia', name: 'Singles of Sofia', category: 'Social community dating', venue: null }, // 9
  { handle: 'millenniumbg', name: 'Millennium Club Bulgaria', category: 'Networking young professionals', venue: null }, // 1
  { handle: 'thenewsofiapubcrawl', name: 'The New Sofia Pub Crawl', category: 'Nightlife social pub crawl', venue: null }, // 0

  // ---- Business, startups ----
  { handle: 'sofiatechpark', name: 'Sofia Tech Park', category: 'Tech startup networking', venue: V('София Тех Парк', 'бул. Цариградско шосе 111, София') }, // 11
  { handle: 'startupbulgaria', name: 'Crossroads by Start Up Bulgaria', category: 'Startup business networking', venue: null }, // 9
  { handle: 'businessparksofia', name: 'Business Park Sofia', category: 'Community business', venue: V('Бизнес Парк София', 'Младост 4, София') }, // 6
  { handle: 'besco.association', name: 'BESCO', category: 'Startup business networking', venue: null }, // 12
  { handle: 'puzlcoworking', name: 'Puzl CowOrKing', category: 'Startup networking community', venue: V('Puzl CowOrKing') }, // 0

  // ---- Dance ----
  { handle: 'teamosofiabachatafestival', name: 'Te Amo Sofia Bachata Festival', category: 'Dance bachata', venue: null }, // 8
  { handle: 'bachatasofiafestival', name: 'Bachata Sofia Festival', category: 'Dance bachata', venue: null }, // 0
  { handle: 'sofiaswing', name: 'Sofia Swing Dance Festival', category: 'Dance swing lindy', venue: null }, // 1
  { handle: 'lindyhopbulgaria', name: 'Lindy Hop Bulgaria', category: 'Dance swing lindy', venue: null }, // 5
  { handle: 'novosalsa', name: 'NovoSalsa', category: 'Dance salsa bachata', venue: V('NovoSalsa') }, // 4

  // ---- Art, festivals, film ----
  { handle: 'sofiaartfair', name: 'Sofia Art Fair', category: 'Art exhibition', venue: null }, // 5
  { handle: 'one_gallery_sofia', name: 'ONE Gallery', category: 'Art exhibition gallery', venue: V('ONE Gallery Sofia') }, // 2
  { handle: 'ica.sofia', name: 'ICA-Sofia', category: 'Art exhibition gallery', venue: V('ICA-Sofia Gallery') }, // 4
  { handle: 'sofia.art.galleries', name: 'Sofia Art Galleries', category: 'Art exhibition gallery', venue: null }, // 11
  { handle: 'sofialivefestival', name: 'Sofia Live Fest', category: 'Music festival concert', venue: null }, // 4
  { handle: 'sofiasummerfest', name: 'Sofia Summer Fest', category: 'Music festival concert', venue: V('Sofia Summer Fest, Южен парк 2') }, // 12
  { handle: 'sofia.lights.festival', name: 'Sofia Lights', category: 'Festival art', venue: null }, // 1
  { handle: 'atojazzfestival', name: 'A to JazZ Festival', category: 'Music festival jazz', venue: null }, // 2
  { handle: 'sofiafilmfest', name: 'Sofia International Film Fest', category: 'Film cinema festival', venue: null }, // 12
];

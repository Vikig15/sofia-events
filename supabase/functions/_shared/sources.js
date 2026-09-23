// Registry of every automated source. Add a connector here and it gets run, health-checked
// and deduplicated. See docs/SOURCES.md for the research behind each one.
//
// minEvents: the run is flagged unhealthy (and does NOT prune old events) below this count.
// Not registered: sofialiveclub.js runs in Node only (its server's TLS ciphers are rejected by Deno);
// its shows are on Eventim anyway. Run it locally with `node scripts/ingest.js --only sofialiveclub`
// after adding it here if needed.
import { icalConnector } from './connectors/ical.js';
import { expandRules } from './recurring.js';
// Ticketing & aggregators
import eventim from './connectors/eventim.js';
import bilet from './connectors/bilet.js';
import sofiastage from './connectors/sofiastage.js';
import allevents from './connectors/allevents.js';
import epaygo from './connectors/epaygo.js';
import ticketbg from './connectors/ticketbg.js';
import visitsofia from './connectors/visitsofia.js';
// Social / community
import luma from './connectors/luma.js';
import meetup from './connectors/meetup.js';
import eventbrite from './connectors/eventbrite.js';
import sofiameetups from './connectors/sofiameetups.js';
import timeheroes from './connectors/timeheroes.js';
import devbg from './connectors/devbg.js';
import wizards from './connectors/wizards.js';
// Dance, sport
import partita from './connectors/partita.js';
import salsavida from './connectors/salsavida.js';
import fivekmrun from './connectors/5kmrun.js';
import racecalendar from './connectors/racecalendar.js';
import chessresults from './connectors/chessresults.js';
// Nightlife
import ra from './connectors/ra.js';
import clwd from './connectors/clwd.js';
import gosofia from './connectors/gosofianightlife.js';
// Venues & culture
import ndk from './connectors/ndk.js';
import toplocentrala from './connectors/toplocentrala.js';
import philharmonic from './connectors/philharmonic.js';
import opera from './connectors/opera.js';
import nationaltheatre from './connectors/nationaltheatre.js';
import joystation from './connectors/joystation.js';
import unisofia from './connectors/unisofia.js';
import powerlifting from './connectors/powerlifting.js';

const ICAL_FEEDS = [
  { key: 'mixtape5', name: 'Mixtape 5', url: 'https://mixtape5.com/events.ics', home: 'https://mixtape5.com', tags: ['Music', 'Nightlife'] },
  { key: 'producttank', name: 'ProductTank Sofia', url: 'https://api.lu.ma/ics/get?entity=calendar&id=cal-dtI5FcwDRt8DbXR', home: 'https://luma.com', tags: ['Business', 'Networking'] },
];

export const SOURCES = [
  { name: 'eventim', run: eventim, minEvents: 50 },
  { name: 'bilet', run: bilet, minEvents: 30 },
  { name: 'sofiastage', run: sofiastage, minEvents: 1000 },
  { name: 'allevents', run: allevents, minEvents: 60 },
  { name: 'epaygo', run: epaygo, minEvents: 300 },
  { name: 'ticketbg', run: ticketbg, minEvents: 25 },
  { name: 'visitsofia', run: visitsofia, minEvents: 40 },
  { name: 'luma', run: luma, minEvents: 10 },
  { name: 'meetup', run: meetup, minEvents: 10 },
  { name: 'eventbrite', run: eventbrite, minEvents: 8 },
  { name: 'sofiameetups', run: sofiameetups, minEvents: 1 },
  { name: 'timeheroes', run: timeheroes, minEvents: 2 },
  { name: 'devbg', run: devbg, minEvents: 1 },
  { name: 'wizards', run: wizards, minEvents: 3 },
  { name: 'partita', run: partita, minEvents: 10 },
  { name: 'salsavida', run: salsavida, minEvents: 5 },
  { name: '5kmrun', run: fivekmrun, minEvents: 2 },
  { name: 'racecalendar', run: racecalendar, minEvents: 4 },
  { name: 'chessresults', run: chessresults, minEvents: 1 },
  { name: 'ra', run: ra, minEvents: 8 },
  { name: 'clwd', run: clwd, minEvents: 4 },
  { name: 'gosofia', run: gosofia, minEvents: 25 },
  { name: 'ndk', run: ndk, minEvents: 10 },
  { name: 'toplocentrala', run: toplocentrala, minEvents: 20 },
  { name: 'philharmonic', run: philharmonic, minEvents: 15 },
  { name: 'opera', run: opera, minEvents: 25 },
  { name: 'nationaltheatre', run: nationaltheatre, minEvents: 50 },
  { name: 'joystation', run: joystation, minEvents: 3 },
  { name: 'unisofia', run: unisofia, minEvents: 3 },
  { name: 'powerlifting', run: powerlifting, minEvents: 0 },
  { name: 'ical', run: icalConnector(ICAL_FEEDS), minEvents: 5 },
  { name: 'recurring', run: async () => expandRules(), minEvents: 5 },
];

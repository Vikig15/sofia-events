// Registry of every automated source. Add a connector here and it gets run, health-checked
// and deduplicated. See docs/SOURCES.md for the full research and the backlog.
import bilet from './connectors/bilet.js';
import eventim from './connectors/eventim.js';
import luma from './connectors/luma.js';
import meetup from './connectors/meetup.js';
import devbg from './connectors/devbg.js';
import wizards from './connectors/wizards.js';
import { icalConnector } from './connectors/ical.js';
import { expandRules } from './recurring.js';

const ICAL_FEEDS = [
  { key: 'mixtape5', name: 'Mixtape 5', url: 'https://mixtape5.com/events.ics', home: 'https://mixtape5.com', tags: ['Music', 'Nightlife'] },
  { key: 'producttank', name: 'ProductTank Sofia', url: 'https://api.lu.ma/ics/get?entity=calendar&id=cal-dtI5FcwDRt8DbXR', home: 'https://luma.com', tags: ['Business', 'Networking'] },
];

// minEvents: the run flags a source as unhealthy if it returns fewer than this many upcoming events.
export const SOURCES = [
  { name: 'bilet', run: bilet, minEvents: 30 },
  { name: 'eventim', run: eventim, minEvents: 50 },
  { name: 'luma', run: luma, minEvents: 10 },
  { name: 'meetup', run: meetup, minEvents: 10 },
  { name: 'devbg', run: devbg, minEvents: 1 },
  { name: 'wizards', run: wizards, minEvents: 3 },
  { name: 'ical', run: icalConnector(ICAL_FEEDS), minEvents: 5 },
  { name: 'recurring', run: async () => expandRules(), minEvents: 5 },
];

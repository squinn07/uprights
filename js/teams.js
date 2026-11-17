/* ==========================================================================
   TEAM DATA  --  edit this file by hand to update rosters, colors or ratings.

   Kickers last checked: 16 November 2026 (Ourlads depth chart, PK position).

   Each team:
     conf / div ........ conference and division (used to group the select screen)
     city / name / abbr  team identity (names and colors only, no logos)
     primary / secondary team colors as hex
     kicker.name ....... current starting kicker
     kicker.number ..... jersey number
     kicker.leg ........ leg strength, roughly 75-99. Higher = more range.
     kicker.acc ........ accuracy, roughly 75-99. Higher = bigger timing sweet spot.

   Ratings are hand-set from career numbers (long makes, career FG%).
   Rookies and kickers with little NFL history are rated conservatively.

   NOTE: the Rams have both Brandon McManus and Joshua Karty (#16) on the
   active roster; McManus is listed first. Baltimore's job has changed hands
   several times this season (Loop on IR, Patterson promoted).
   ========================================================================== */

const NFL_TEAMS = [
  // ---------------- AFC East ----------------
  { conf: 'AFC', div: 'East',  city: 'Buffalo',       name: 'Bills',      abbr: 'BUF', primary: '#00338D', secondary: '#C60C30', kicker: { name: 'Tyler Bass',        number: 16, leg: 86, acc: 82 } },
  { conf: 'AFC', div: 'East',  city: 'Miami',         name: 'Dolphins',   abbr: 'MIA', primary: '#008E97', secondary: '#FC4C02', kicker: { name: 'Zane Gonzalez',     number: 31, leg: 84, acc: 79 } },
  { conf: 'AFC', div: 'East',  city: 'New England',   name: 'Patriots',   abbr: 'NE',  primary: '#002244', secondary: '#C60C30', kicker: { name: 'Andy Borregales',   number: 8,  leg: 84, acc: 82 } },
  { conf: 'AFC', div: 'East',  city: 'New York',      name: 'Jets',       abbr: 'NYJ', primary: '#125740', secondary: '#FFFFFF', kicker: { name: 'Jason Sanders',     number: 19, leg: 86, acc: 83 } },
  // ---------------- AFC North ----------------
  { conf: 'AFC', div: 'North', city: 'Baltimore',     name: 'Ravens',     abbr: 'BAL', primary: '#241773', secondary: '#9E7C0C', kicker: { name: 'Riley Patterson',   number: 35, leg: 78, acc: 85 } },
  { conf: 'AFC', div: 'North', city: 'Cincinnati',    name: 'Bengals',    abbr: 'CIN', primary: '#FB4F14', secondary: '#000000', kicker: { name: 'Evan McPherson',    number: 2,  leg: 92, acc: 83 } },
  { conf: 'AFC', div: 'North', city: 'Cleveland',     name: 'Browns',     abbr: 'CLE', primary: '#311D00', secondary: '#FF3C00', kicker: { name: 'Andre Szmyt',       number: 25, leg: 82, acc: 82 } },
  { conf: 'AFC', div: 'North', city: 'Pittsburgh',    name: 'Steelers',   abbr: 'PIT', primary: '#101820', secondary: '#FFB612', kicker: { name: 'Chris Boswell',     number: 9,  leg: 90, acc: 90 } },
  // ---------------- AFC South ----------------
  { conf: 'AFC', div: 'South', city: 'Houston',       name: 'Texans',     abbr: 'HOU', primary: '#03202F', secondary: '#A71930', kicker: { name: "Ka'imi Fairbairn",  number: 15, leg: 89, acc: 87 } },
  { conf: 'AFC', div: 'South', city: 'Indianapolis',  name: 'Colts',      abbr: 'IND', primary: '#002C5F', secondary: '#FFFFFF', kicker: { name: 'Spencer Shrader',   number: 3,  leg: 84, acc: 86 } },
  { conf: 'AFC', div: 'South', city: 'Jacksonville',  name: 'Jaguars',    abbr: 'JAX', primary: '#006778', secondary: '#D7A22A', kicker: { name: 'Cam Little',        number: 39, leg: 97, acc: 85 } },
  { conf: 'AFC', div: 'South', city: 'Tennessee',     name: 'Titans',     abbr: 'TEN', primary: '#0C2340', secondary: '#4B92DB', kicker: { name: 'Joey Slye',         number: 6,  leg: 91, acc: 79 } },
  // ---------------- AFC West ----------------
  { conf: 'AFC', div: 'West',  city: 'Denver',        name: 'Broncos',    abbr: 'DEN', primary: '#FB4F14', secondary: '#002244', kicker: { name: 'Wil Lutz',          number: 3,  leg: 86, acc: 86 } },
  { conf: 'AFC', div: 'West',  city: 'Kansas City',   name: 'Chiefs',     abbr: 'KC',  primary: '#E31837', secondary: '#FFB81C', kicker: { name: 'Harrison Butker',   number: 7,  leg: 91, acc: 88 } },
  { conf: 'AFC', div: 'West',  city: 'Las Vegas',     name: 'Raiders',    abbr: 'LV',  primary: '#000000', secondary: '#A5ACAF', kicker: { name: 'Matt Gay',          number: 14, leg: 88, acc: 83 } },
  { conf: 'AFC', div: 'West',  city: 'Los Angeles',   name: 'Chargers',   abbr: 'LAC', primary: '#0080C6', secondary: '#FFC20E', kicker: { name: 'Cameron Dicker',    number: 11, leg: 88, acc: 94 } },

  // ---------------- NFC East ----------------
  { conf: 'NFC', div: 'East',  city: 'Dallas',        name: 'Cowboys',    abbr: 'DAL', primary: '#003594', secondary: '#869397', kicker: { name: 'Brandon Aubrey',    number: 17, leg: 98, acc: 90 } },
  { conf: 'NFC', div: 'East',  city: 'New York',      name: 'Giants',     abbr: 'NYG', primary: '#0B2265', secondary: '#A71930', kicker: { name: 'Dominic Zvada',     number: 34, leg: 85, acc: 80 } },
  { conf: 'NFC', div: 'East',  city: 'Philadelphia',  name: 'Eagles',     abbr: 'PHI', primary: '#004C54', secondary: '#A5ACAF', kicker: { name: 'Jake Elliott',      number: 4,  leg: 90, acc: 85 } },
  { conf: 'NFC', div: 'East',  city: 'Washington',    name: 'Commanders', abbr: 'WAS', primary: '#5A1414', secondary: '#FFB612', kicker: { name: 'Drew Stevens',      number: 19, leg: 86, acc: 79 } },
  // ---------------- NFC North ----------------
  { conf: 'NFC', div: 'North', city: 'Chicago',       name: 'Bears',      abbr: 'CHI', primary: '#0B162A', secondary: '#C83803', kicker: { name: 'Cairo Santos',      number: 8,  leg: 80, acc: 86 } },
  { conf: 'NFC', div: 'North', city: 'Detroit',       name: 'Lions',      abbr: 'DET', primary: '#0076B6', secondary: '#B0B7BC', kicker: { name: 'Jake Bates',        number: 39, leg: 91, acc: 84 } },
  { conf: 'NFC', div: 'North', city: 'Green Bay',     name: 'Packers',    abbr: 'GB',  primary: '#203731', secondary: '#FFB612', kicker: { name: 'Trey Smack',        number: 28, leg: 87, acc: 79 } },
  { conf: 'NFC', div: 'North', city: 'Minnesota',     name: 'Vikings',    abbr: 'MIN', primary: '#4F2683', secondary: '#FFC62F', kicker: { name: 'Will Reichard',     number: 16, leg: 91, acc: 87 } },
  // ---------------- NFC South ----------------
  { conf: 'NFC', div: 'South', city: 'Atlanta',       name: 'Falcons',    abbr: 'ATL', primary: '#A71930', secondary: '#000000', kicker: { name: 'Jake Moody',        number: 39, leg: 85, acc: 78 } },
  { conf: 'NFC', div: 'South', city: 'Carolina',      name: 'Panthers',   abbr: 'CAR', primary: '#0085CA', secondary: '#101820', kicker: { name: 'Ryan Fitzgerald',   number: 10, leg: 85, acc: 84 } },
  { conf: 'NFC', div: 'South', city: 'New Orleans',   name: 'Saints',     abbr: 'NO',  primary: '#D3BC8D', secondary: '#101820', kicker: { name: 'Charlie Smyth',     number: 39, leg: 87, acc: 78 } },
  { conf: 'NFC', div: 'South', city: 'Tampa Bay',     name: 'Buccaneers', abbr: 'TB',  primary: '#D50A0A', secondary: '#34302B', kicker: { name: 'Chase McLaughlin',  number: 4,  leg: 92, acc: 88 } },
  // ---------------- NFC West ----------------
  { conf: 'NFC', div: 'West',  city: 'Arizona',       name: 'Cardinals',  abbr: 'ARI', primary: '#97233F', secondary: '#FFB612', kicker: { name: 'Chad Ryland',       number: 38, leg: 87, acc: 80 } },
  { conf: 'NFC', div: 'West',  city: 'Los Angeles',   name: 'Rams',       abbr: 'LAR', primary: '#003594', secondary: '#FFA300', kicker: { name: 'Brandon McManus',   number: 19, leg: 88, acc: 82 } },
  { conf: 'NFC', div: 'West',  city: 'San Francisco', name: '49ers',      abbr: 'SF',  primary: '#AA0000', secondary: '#B3995D', kicker: { name: 'Eddy Piñeiro',      number: 18, leg: 83, acc: 90 } },
  { conf: 'NFC', div: 'West',  city: 'Seattle',       name: 'Seahawks',   abbr: 'SEA', primary: '#002244', secondary: '#69BE28', kicker: { name: 'Jason Myers',       number: 5,  leg: 89, acc: 85 } },
];

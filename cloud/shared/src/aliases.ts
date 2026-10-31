// How players in Russia and the CIS type game titles: Russian names,
// transliterations, slang and abbreviations ("гта 6", "кс2", "ведьмак",
// "рдр2"), mapped to canonical titles. Game search (server/src/games.ts) shows
// the canonical games first and asks the stores for their real names, because
// Steam store search does not understand "ведьмак".
import { normalizeGameName } from "./validation";

/** "other": not sold on Steam (consoles, mobile, own launchers, unreleased), so a Steam title that merely starts the same is another game. */
export type GameStore = "steam" | "other";

/**
 * [canonical title, aliases separated by "|", store]. A title is also its own
 * alias. An alias listed in several rows finds all of them in table order, so
 * rows go from the most played game of a series to the least. Aliases are
 * compared after gameSearchKey(), so case, ё/й, punctuation, "cs2" vs "cs 2"
 * and "gta vi" vs "gta 6" never need separate spellings. Canonical titles use
 * the store spelling without ™/® (or the POPULAR_GAMES spelling).
 */
type AliasRow = readonly [title: string, aliases: string, store?: "other"];

export const GAME_ALIASES: readonly AliasRow[] = [
  // Shooters and the biggest online games
  ["Counter-Strike 2", "кс|кс 2|cs|cs 2|контра|контра 2|контр страйк|контр страйк 2|контрстрайк|каунтер страйк|каунтер страйк 2|кантер страйк|counter strike|counterstrike|counter strike 2"],
  ["Dota 2", "дота|дота 2|дотка|доту|дота два|dota|dota 2"],
  ["Grand Theft Auto V", "гта|gta|гта 5|gta 5|гта пять|гташка|гта онлайн|gta online|гта рп|gta rp|гта 5 рп|gta 5 rp|grand theft auto|гранд тефт авто|гранд тефт авто 5"],
  ["Grand Theft Auto VI", "гта|gta|гта 6|gta 6|гта шесть|гта 6 онлайн|grand theft auto|гранд тефт авто|гранд тефт авто 6", "other"],
  ["Grand Theft Auto: San Andreas", "гта|gta|гта са|gta sa|гта сан андреас|сан андреас|san andreas|самп|samp|гта самп|gta samp|крмп|crmp|grand theft auto"],
  ["Grand Theft Auto IV", "гта|gta|гта 4|gta 4|гта четыре|grand theft auto"],
  ["Grand Theft Auto: Vice City", "гта|gta|гта вайс сити|вайс сити|гта вс|gta vc|vice city|grand theft auto"],
  ["Grand Theft Auto III", "гта 3|gta 3|гта три"],
  ["Minecraft", "майнкрафт|майнкравт|майнкрафтик|майн|майнкрафт джава|майнкрафт бедрок|майнкрафт пе|minecraft|minecraft java|minecraft bedrock|mc", "other"],
  ["PUBG: Battlegrounds", "пабг|пубг|пубж|пабж|pubg|пабг батлграундс|батлграундс|battlegrounds|playerunknowns battlegrounds"],
  ["Valorant", "валорант|валик|вало|valorant|valo", "other"],
  ["Fortnite", "фортнайт|фортик|форт|fortnite", "other"],
  ["Apex Legends", "апекс|апекс легендс|апекс леджендс|апех|apex"],
  ["Rust", "раст|руст|rust"],
  ["Escape from Tarkov", "тарков|тарк|ефт|eft|tarkov|побег из таркова|эскейп фром тарков"],
  ["World of Tanks", "танки|танчики|вот|wot|ворлд оф танкс|ворлд оф тэнкс|world of tanks"],
  ["Мир танков", "мир танков|танки|танчики|мт|леста|lesta|mir tankov|tanki", "other"],
  ["War Thunder", "вар тандер|вартандер|вар тундер|тундра|вт|wt|war thunder|warthunder"],
  ["Warface", "варфейс|варфэйс|вф|warface|warface clutch|варфейс клатч"],
  ["Roblox", "роблокс|роблакс|роблоск|роблокс студио|roblox", "other"],
  ["Genshin Impact", "геншин|генш|генщин|геншин импакт|genshin|genshin impact", "other"],
  ["League of Legends", "лол|лолка|лига|лига легенд|lol|league of legends", "other"],
  ["Counter-Strike: Global Offensive", "кс го|ксго|csgo|cs go|кс глобал офенсив|глобал офенсив|global offensive"],
  // Steam sells 1.6 as "Counter-Strike" (app 10): the title keeps that name from meaning CS2.
  ["Counter-Strike", "кс 1.6|кс 16|cs 1.6|cs 16|контра 1.6|контра 16|counter strike 1.6|counter-strike 1.6"],
  ["Counter-Strike: Source", "кс соурс|кс сурс|ксс|css|cs source|counter strike source"],
  ["Standoff 2", "стандофф|стандоф|стендофф|стендоф|стэндофф|стандофф 2|стендофф 2|standoff|standoff 2|со2|so2", "other"],
  ["Brawl Stars", "бравл старс|бравл|бравлик|браво старс|бс|brawl stars|brawl", "other"],

  // Story games
  ["Red Dead Redemption 2", "рдр|рдр 2|rdr|rdr 2|ред дед|ред дэд|ред дед редемпшн|ред дед редемпшн 2|red dead|red dead 2|red dead online|ред дед онлайн"],
  ["Red Dead Redemption", "рдр|рдр 1|rdr|rdr 1|ред дед|red dead|ред дед редемпшн 1|red dead redemption 1"],
  ["The Witcher 3: Wild Hunt", "ведьмак|ведьмак 3|ведьмак дикая охота|ведьмак 3 дикая охота|дикая охота|ведьмачок|witcher|witcher 3|the witcher|wild hunt|вичер|витчер|вичер 3"],
  ["The Witcher 2: Assassins of Kings", "ведьмак|ведьмак 2|ведьмак 2 убийцы королей|убийцы королей|witcher|witcher 2|the witcher|вичер 2"],
  ["The Witcher", "ведьмак|ведьмак 1|witcher|witcher 1|the witcher|вичер 1"],
  ["The Witcher 4", "ведьмак 4|witcher 4|вичер 4", "other"],
  ["Cyberpunk 2077", "киберпанк|киберпанк 2077|кибер|киберпук|сайберпанк|cyberpunk|cyber punk|cp2077|cp 2077|кп 2077"],
  ["Elden Ring", "элден ринг|элдер ринг|елден ринг|элден|элденринг|кольцо элдена|elden|eldenring"],
  ["Elden Ring Nightreign", "найтрейн|элден ринг найтрейн|nightreign|элден|elden"],
  ["Baldur's Gate 3", "бг3|бг 3|bg3|bg|балдурс гейт|балдурс гейт 3|балдур|балдурс|балдурсгейт|балдурс гейт три|врата балдура|врата балдура 3|baldurs gate|baldur"],

  // Call of Duty, Battlefield, sports
  ["Call of Duty: Warzone", "варзон|варзона|warzone|вз|колда|кал оф дьюти|калл оф дьюти|колл оф дьюти|кол оф дьюти|cod|call of duty|колда варзон"],
  ["Call of Duty: Black Ops 7", "блэк опс 7|блек опс 7|bo7|black ops 7|колда|кал оф дьюти|калл оф дьюти|колл оф дьюти|кол оф дьюти|cod|call of duty"],
  ["Call of Duty: Black Ops 6", "блэк опс 6|блек опс 6|bo6|black ops 6|колда|кал оф дьюти|калл оф дьюти|колл оф дьюти|кол оф дьюти|cod|call of duty"],
  ["Call of Duty: Modern Warfare 4", "модерн варфейр 4|mw4|modern warfare 4|колда|cod|call of duty"],
  ["Call of Duty: Modern Warfare III", "модерн варфейр 3|модерн варфаер 3|mw3|modern warfare 3|колда|cod|call of duty"],
  ["Call of Duty: Mobile", "колда мобайл|кал оф дьюти мобайл|codm|cod mobile|call of duty mobile|кодм", "other"],
  ["Battlefield 6", "батла|батлфилд|бателфилд|battlefield|бф|bf|бф6|bf6|батла 6|батлфилд 6"],
  ["Battlefield 2042", "батла|батлфилд|battlefield|бф|bf|бф 2042|bf 2042|батла 2042|батлфилд 2042"],
  ["Battlefield 1", "батла|батлфилд|battlefield|бф|bf|бф1|bf1|батла 1|батлфилд 1"],
  ["Battlefield V", "батла|батлфилд|battlefield|бф|bf|бф5|bf5|батла 5|батлфилд 5"],
  ["Battlefield 4", "бф4|bf4|батла 4|батлфилд 4"],
  ["Battlefield 3", "бф3|bf3|батла 3|батлфилд 3", "other"],
  ["EA Sports FC 27", "фифа|fifa|фк|fc|ea fc|еа фк|фк 27|fc 27|фифа 27|fifa 27"],
  ["EA Sports FC 26", "фифа|fifa|фк|fc|ea fc|еа фк|фк 26|fc 26|фифа 26|fifa 26"],
  ["EA Sports FC 25", "фифа|fifa|фк|fc|ea fc|еа фк|фк 25|fc 25|фифа 25|fifa 25"],
  ["EA Sports FC 24", "фифа|fifa|фк|fc|ea fc|еа фк|фк 24|fc 24|фифа 24|fifa 24"],
  ["FIFA 23", "фифа 23|fifa 23"],
  ["eFootball", "ефутбол|ифутбол|пес|pes|efootball|pro evolution soccer"],
  ["Tom Clancy's Rainbow Six Siege", "радуга|радуга 6|r6|r6s|r6 siege|рейнбоу|рейнбоу сикс|рейнбоу сикс сидж|сидж|осада|rainbow six|rainbow 6|rainbow six siege|siege x"],
  ["Overwatch 2", "овервотч|овервоч|овервач|овервотч 2|овер|ow|ow2|overwatch"],
  ["Marvel Rivals", "марвел ривалс|марвел райвалс|ривалс|райвалс|марвел|rivals|marvel rivals"],
  ["Deadlock", "дедлок|дэдлок|deadlock"],
  ["The Finals", "файналс|финалс|зе файналс|finals"],
  ["Helldivers 2", "хеллдайверс|хелдайверс|хеллдайверс 2|хелдайверс 2|хд2|hd2|helldivers|адские десантники|адские десантники 2"],
  ["Arena Breakout: Infinite", "арена брейкаут|арена брейкаут инфинит|abi|arena breakout"],
  ["Delta Force", "дельта форс|дельта|delta force"],
  ["Hunt: Showdown 1896", "хант|хант шоудаун|hunt|hunt showdown"],
  ["DayZ", "дейз|дэйз|дейзи|dayz|day z"],

  // Stalker, Metro and Russian games
  ["S.T.A.L.K.E.R. 2: Heart of Chornobyl", "сталкер|сталкер 2|stalker|stalker 2|сердце чернобыля|сталкер 2 сердце чернобыля|heart of chornobyl|heart of chernobyl"],
  ["S.T.A.L.K.E.R.: Shadow of Chernobyl", "сталкер|stalker|тень чернобыля|сталкер тень чернобыля|тч|shadow of chernobyl|shadow of chornobyl"],
  ["S.T.A.L.K.E.R.: Call of Pripyat", "сталкер|stalker|зов припяти|сталкер зов припяти|зп|call of pripyat"],
  ["S.T.A.L.K.E.R.: Clear Sky", "сталкер|stalker|чистое небо|сталкер чистое небо|чн|clear sky"],
  ["STALCRAFT", "сталкрафт|сталкрафт икс|stalcraft|stalcraft x"],
  ["Metro Exodus", "метро|метро исход|метро эксодус|исход|metro|metro exodus"],
  ["Metro 2033 Redux", "метро|метро 2033|metro|metro 2033"],
  ["Metro: Last Light Redux", "метро|метро ласт лайт|метро луч надежды|луч надежды|metro|last light|metro last light"],
  ["Atomic Heart", "атомик харт|атомик херт|атомик|атомное сердце|atomic heart|atomic"],
  ["Смута", "смута|smuta|smoota", "other"],
  ["World of Tanks Blitz", "вот блиц|блиц|танки блиц|wot blitz"],
  ["Tanks Blitz", "танкс блиц|блиц|танки блиц|леста блиц|tanks blitz", "other"],
  ["World of Warships", "корабли|кораблики|вовс|wows|ворлд оф варшипс|world of warships"],
  ["Мир кораблей", "мир кораблей|корабли|кораблики", "other"],
  ["Crossout", "кроссаут|кросаут|crossout"],
  ["Caliber", "калибр|калибер|caliber"],
  ["Танки Онлайн", "танки онлайн|танкионлайн|tanki online", "other"],
  ["CrossFire", "кроссфаер|кросфаер|кроссфайр|кф|cf|crossfire", "other"],

  // Blizzard and MMOs
  ["World of Warcraft", "вов|wow|вовка|варкрафт|ворлд оф варкрафт|world of warcraft|вов классик|wow classic", "other"],
  ["Hearthstone", "хартстоун|хартстон|харстоун|хс|hs|hearthstone", "other"],
  ["StarCraft II", "старкрафт|старкрафт 2|старик|sc2|starcraft|starcraft 2", "other"],
  ["Warcraft III: Reforged", "варкрафт|варкрафт 3|варик|варик 3|wc3|warcraft|warcraft 3|рефордж|reforged", "other"],
  ["Diablo IV", "диабло|диабла|диабло 4|д4|d4|diablo|diablo 4"],
  ["Diablo II: Resurrected", "диабло|диабло 2|диабло 2 воскрешение|д2р|d2r|diablo|diablo 2|diablo 2 resurrected", "other"],
  ["Diablo III", "диабло 3|d3|diablo 3", "other"],
  ["Path of Exile 2", "пое|poe|пое 2|poe 2|путь изгнания|путь изгнания 2|path of exile|path of exile 2"],
  ["Path of Exile", "пое|poe|пое 1|poe 1|путь изгнания|path of exile"],
  ["Lost Ark", "лост арк|лостарк|лостик|lost ark"],
  ["Black Desert", "бдо|bdo|блек десерт|блэк десерт|блэк дезерт|черная пустыня|black desert"],
  ["Albion Online", "альбион|альбион онлайн|albion"],
  ["EVE Online", "ева|ева онлайн|еве|eve|eve online"],
  ["Lineage 2", "линейка|линейка 2|линейдж|линейдж 2|ла2|л2|l2|lineage|lineage 2", "other"],
  ["Perfect World", "пв|перфект ворлд|перфект|идеальный мир|pw|perfect world", "other"],
  ["Аллоды Онлайн", "аллоды|аллоды онлайн|allods|allods online", "other"],

  // Mobile
  ["Clash Royale", "клеш рояль|клэш рояль|клеш роял|клеш|cr|clash royale", "other"],
  ["Clash of Clans", "клеш оф кланс|клэш оф кланс|клеш оф кленс|клеш|кок|coc|clash of clans", "other"],
  ["PUBG Mobile", "пабг|пубг|pubg|пабг мобайл|пубг мобайл|пабг м|pubg mobile|pubgm|pubg m", "other"],
  ["Mobile Legends: Bang Bang", "млбб|mlbb|мобайл леджендс|мобайл легендс|мобла|mobile legends", "other"],
  ["Free Fire", "фри фаер|фри фаир|фрифаер|free fire|freefire", "other"],
  ["League of Legends: Wild Rift", "вайлд рифт|лол мобайл|wild rift|lol wild rift", "other"],
  ["Honkai: Star Rail", "хср|hsr|хонкай|хонкай стар рейл|стар рейл|honkai|honkai star rail|star rail", "other"],
  ["Zenless Zone Zero", "ззз|zzz|зенлесс|зенлесс зон зиро|zenless", "other"],
  ["Wuthering Waves", "вува|вувы|вутеринг вейвс|wuwa|wuthering waves"],
  ["Pokémon GO", "покемон го|покемон гоу|покемоны го|pokemon go", "other"],
  ["Subway Surfers", "сабвей серф|сабвей серферс|сабвей|subway surfers|subway surf", "other"],
  ["Geometry Dash", "геометри дэш|геометри даш|геометри деш|геометрия даш|гд|gd|geometry dash"],
  ["Asphalt Legends", "асфальт|асфальт 9|асфальт легендс|asphalt|asphalt 9|asphalt legends"],

  // Sandbox, survival, co-op
  ["Terraria", "террария|терария|terraria"],
  ["Stardew Valley", "стардью|стардью валли|стардью вэлли|стардев|stardew|stardew valley"],
  ["Among Us", "амонг ас|амонгас|амогус|амонг|среди нас|among us|amongus"],
  ["Phasmophobia", "фазмофобия|фазмафобия|фазма|фазмо|phasmo|phasmophobia"],
  ["Lethal Company", "летал компани|летал компания|летал|lethal|lethal company"],
  ["R.E.P.O.", "репо|repo"],
  ["PEAK", "пик|peak"],
  ["Schedule I", "шедул|шедул 1|шедуле 1|скедьюл 1|schedule|schedule 1"],
  ["Dead by Daylight", "дбд|dbd|дед бай дейлайт|дэд бай дэйлайт|дед бай|dead by daylight"],
  ["Five Nights at Freddy's", "фнаф|fnaf|фредди|пять ночей с фредди|five nights at freddys"],
  ["Poppy Playtime", "поппи плейтайм|поппи|poppy|poppy playtime"],
  ["Hello Neighbor", "привет сосед|хеллоу нейбор|хелоу нейбор|hello neighbor|hello neighbour"],
  ["ARK: Survival Ascended", "арк|ark|арк сурвайвал|арк асцендед|ark survival|ark ascended"],
  ["ARK: Survival Evolved", "арк|ark|арк сурвайвал|арк эволвд|ark survival|ark evolved"],
  ["Palworld", "палворлд|палворд|палы|пал ворлд|palworld"],
  ["Valheim", "вальхейм|валхейм|valheim"],
  ["Sons of the Forest", "санс оф зе форест|сонс оф зе форест|сыновья леса|форест 2|sons of the forest|sotf|the forest 2"],
  ["The Forest", "форест|зе форест|the forest|forest"],
  ["Raft", "рафт|плот|raft"],
  ["Subnautica", "сабнатика|сабнаутика|subnautica"],
  ["7 Days to Die", "7 дней чтобы умереть|7дтд|7dtd|7 days|севен дейс"],
  ["Project Zomboid", "зомбоид|проджект зомбоид|проект зомбоид|pz|zomboid|project zomboid"],
  ["SCUM", "скам|scum"],
  ["Deep Rock Galactic", "дрг|drg|дип рок|дип рок галактик|deep rock"],
  ["Don't Starve Together", "донт старв|донт старв тугезер|не голодай|dst|dont starve|dont starve together"],
  ["Grounded", "граундед|граундид|grounded"],
  ["Enshrouded", "аншраудед|еншраудед|аншрудед|enshrouded"],
  ["V Rising", "ви райзинг|в райзинг|v rising"],
  ["Once Human", "уанс хьюман|ванс хьюман|once human"],
  ["Dune: Awakening", "дюна|дюна пробуждение|dune|dune awakening"],
  ["The Sims 4", "симс|симс 4|симсы|симки|зе симс|sims|sims 4|the sims"],
  ["Cities: Skylines II", "ситис скайлайнс|ситис скайлайнс 2|ситис|скайлайнс|cities skylines|cities skylines 2"],
  ["Euro Truck Simulator 2", "етс|етс 2|ets|ets 2|euro truck|евро трак|евротрак|евро трак симулятор|дальнобой|трак симулятор"],
  ["American Truck Simulator", "атс|ats|американ трак|american truck"],
  ["SnowRunner", "сноураннер|сноуранер|сноу раннер|snowrunner|snow runner"],
  ["My Summer Car", "май саммер кар|мой летний автомобиль|летний автомобиль|мск|msc|my summer car"],
  ["BeamNG.drive", "бимка|бименджи|бимнджи|бимнг|beamng|beam ng"],

  // Racing, sports, fighting
  ["Forza Horizon 5", "форза|форза хорайзон|форза хоризон|форза хорайзон 5|форза 5|фх5|fh5|forza|forza horizon"],
  ["Need for Speed Unbound", "нфс|nfs|нид фор спид|need for speed|нфс анбаунд|анбаунд|nfs unbound"],
  ["Need for Speed Heat", "нфс|nfs|нид фор спид|need for speed|нфс хит|nfs heat"],
  ["Need for Speed: Most Wanted", "нфс мост вантед|мост вантед|мост вонтед|нфс мв|nfs mw|nfs most wanted|most wanted"],
  ["The Crew Motorfest", "зе крю|крю|крю моторфест|моторфест|the crew|motorfest"],
  ["Assetto Corsa", "ассетто|ассетто корса|ассета корса|assetto|assetto corsa"],
  ["Assetto Corsa Competizione", "ассетто корса компетиционе|компетиционе|acc"],
  ["Rocket League", "рокет лига|рокет лиг|рокетлига|рокет|рл|rl|rocket league", "other"],
  ["NBA 2K26", "нба|нба 2к|нба 2к26|2к|nba|nba 2k|2k"],
  ["Mortal Kombat 1", "мортал комбат|мортал|мк|мк 1|смертельная битва|mk|mk 1|mortal kombat|mortal kombat 1"],
  ["Mortal Kombat 11", "мортал комбат|мк|mk|mortal kombat|мк 11|mk 11|мортал комбат 11|mortal kombat 11"],
  ["Tekken 8", "теккен|текен|теккен 8|tekken|tekken 8"],
  ["Street Fighter 6", "стрит файтер|стрит файтер 6|sf6|street fighter|street fighter 6"],

  // PlayStation
  ["God of War", "год оф вар|годофвар|год оф вор|гов|gow|бог войны|кратос|god of war|god of war 2018"],
  ["God of War Ragnarök", "год оф вар|гов|gow|бог войны|god of war|рагнарек|рагнарок|гов рагнарек|год оф вар рагнарек|gow ragnarok|ragnarok"],
  ["The Last of Us Part I", "тлоу|tlou|одни из нас|ласт оф ас|ластофас|зе ласт оф ас|the last of us|last of us|тлоу 1|tlou 1|одни из нас 1|ласт оф ас 1|the last of us 1|last of us 1"],
  ["The Last of Us Part II", "тлоу|tlou|одни из нас|ласт оф ас|ластофас|зе ласт оф ас|the last of us|last of us|тлоу 2|tlou 2|одни из нас 2|ласт оф ас 2|the last of us 2|last of us 2"],
  ["Horizon Forbidden West", "хорайзон|хоризон|horizon|элой|aloy|запретный запад|хорайзон запретный запад|хорайзон форбидден вест|forbidden west|хфв|hfw"],
  ["Horizon Zero Dawn", "хорайзон|хоризон|horizon|элой|aloy|хорайзон зеро дон|зеро дон|нулевой рассвет|horizon zero dawn|hzd"],
  ["Marvel's Spider-Man 2", "спайдермен|спайдер мен|спайдермэн|человек паук|паук|спайди|spider man|spiderman|спайдермен 2|человек паук 2|spider man 2|spiderman 2"],
  ["Marvel's Spider-Man Remastered", "спайдермен|спайдер мен|человек паук|паук|spider man|spiderman|спайдермен 1|человек паук 1|spider man 1|spider man remastered"],
  ["Marvel's Spider-Man: Miles Morales", "майлз моралес|майлс моралес|моралес|спайдермен майлз|miles morales|spider man miles morales"],
  ["Ghost of Tsushima", "гост оф цусима|гост оф тсусима|призрак цусимы|цусима|гост|ghost of tsushima|tsushima"],
  ["Ghost of Yōtei", "гост оф йотей|призрак йотея|йотей|гост|ghost of yotei|yotei", "other"],
  ["Death Stranding", "дез стрендинг|дет стрендинг|стрендинг|кодзима|death stranding"],
  ["Death Stranding 2: On the Beach", "дез стрендинг|дез стрендинг 2|стрендинг 2|кодзима|death stranding|death stranding 2", "other"],
  ["Uncharted: Legacy of Thieves Collection", "анчартед|анчартед 4|анчартед наследие воров|натан дрейк|uncharted|uncharted 4"],
  ["Detroit: Become Human", "детройт|детройт стать человеком|detroit|detroit become human"],
  ["Days Gone", "дейз гон|дэйс гон|жизнь после|days gone"],
  ["Bloodborne", "бладборн|бладберн|блудборн|бб|bloodborne", "other"],
  ["Astro Bot", "астро бот|астробот|astro bot|astrobot", "other"],
  ["Gran Turismo 7", "гран туризмо|гран туризмо 7|гт7|gt7|gran turismo|gran turismo 7", "other"],

  // Horror and souls-likes
  ["Resident Evil Requiem", "резидент|резидент ивел|резидент эвил|резик|обитель зла|re|resident evil|реквием|requiem|re9|ре9|resident evil 9|резидент ивел 9"],
  ["Resident Evil 4", "резидент|резидент ивел|резидент эвил|резик|обитель зла|re|resident evil|ре4|re4|резидент 4|резидент ивел 4|обитель зла 4"],
  ["Resident Evil Village", "резидент|резик|обитель зла|re|resident evil|виллейдж|вилладж|деревня|re8|ре8|village|resident evil 8|обитель зла деревня"],
  ["Resident Evil 2", "ре2|re2|резидент 2|резидент ивел 2|обитель зла 2"],
  ["Silent Hill f", "сайлент хилл|сайлент хил|сайлент хилл ф|silent hill"],
  ["Silent Hill 2", "сайлент хилл|сайлент хил|сайлент хилл 2|silent hill|silent hill 2|sh2"],
  ["Dark Souls III", "дарк соулс|дарк солс|дарк соулз|темные души|дс|ds|dark souls|дарк соулс 3|дс3|дс 3|ds3|dark souls 3"],
  ["Dark Souls: Remastered", "дарк соулс|дарк солс|темные души|дс|ds|dark souls|дарк соулс 1|дс1|ds1|dark souls 1|dark souls remastered|дарк соулс ремастеред"],
  ["Dark Souls II: Scholar of the First Sin", "дарк соулс|дарк солс|темные души|дс|ds|dark souls|дарк соулс 2|дс2|ds2|dark souls 2"],
  ["Sekiro: Shadows Die Twice", "секиро|sekiro"],
  ["Lies of P", "лайс оф пи|лайс оф п|ложь пи|ложь п|пиноккио|lies of p|lop"],
  ["Black Myth: Wukong", "вуконг|укун|сунь укун|блэк мит|блек мит|черный миф|black myth|wukong"],
  ["Stellar Blade", "стеллар блейд|стелар блейд|stellar blade"],
  ["Hollow Knight: Silksong", "силксонг|силк сонг|шелковая песня|холлоу найт|холоу найт|хк|hk|hollow knight|silksong"],
  ["Hollow Knight", "холлоу найт|холоу найт|холлоу кнайт|полый рыцарь|хк|hk|hollow knight"],
  ["Hades II", "хейдес|хадес|аид|hades|хейдес 2|хадес 2|аид 2|hades 2"],
  ["Hades", "хейдес|хадес|аид|hades|хейдес 1|hades 1"],

  // RPG
  ["Hogwarts Legacy", "хогвартс|хогвардс|хогвартс легаси|хогвартс наследие|наследие хогвартса|гарри поттер|hogwarts|hogwarts legacy"],
  ["The Elder Scrolls V: Skyrim", "скайрим|скурим|скаирим|скайрим се|skyrim|tes 5|тес 5|древние свитки|свитки|elder scrolls"],
  ["The Elder Scrolls IV: Oblivion Remastered", "обливион|обла|oblivion|tes 4|тес 4|обливион ремастер|oblivion remastered|древние свитки|свитки|elder scrolls"],
  ["The Elder Scrolls Online", "тесо|teso|eso|тес онлайн|древние свитки онлайн|elder scrolls online"],
  ["Fallout 4", "фоллаут|фолаут|фаллаут|фалаут|фолыч|fallout|фоллаут 4|фолаут 4|fo4"],
  ["Fallout 76", "фоллаут|фолаут|фаллаут|фолыч|fallout|фоллаут 76|фолаут 76|ф76|fo76"],
  ["Fallout: New Vegas", "фоллаут|фолаут|фаллаут|фолыч|fallout|нью вегас|фоллаут нью вегас|фнв|fnv|new vegas|fallout nv"],
  ["Fallout 3", "фоллаут 3|фолаут 3|fo3"],
  ["Starfield", "старфилд|звездное поле|starfield"],
  ["Divinity: Original Sin 2", "дивинити|дивинити 2|дос2|дос 2|dos2|divinity|divinity 2|original sin 2"],
  ["Kingdom Come: Deliverance II", "кингдом кам|кингдом кам 2|кингдом кам деливеренс 2|ккд|ккд2|kcd|kcd2|kingdom come|kingdom come 2|kingdom come deliverance 2"],
  ["Kingdom Come: Deliverance", "кингдом кам|кингдом кам 1|ккд|ккд1|kcd|kcd1|kingdom come|kingdom come deliverance"],
  ["Clair Obscur: Expedition 33", "экспедиция 33|экспедиция|экспедишн 33|клер обскур|клэр обскур|клер обскюр|e33|э33|expedition 33|clair obscur"],
  ["Mass Effect Legendary Edition", "масс эффект|масс эфект|мас эффект|шепард|mass effect"],
  ["Dragon Age: The Veilguard", "драгон эйдж|эпоха драконов|вейлгард|dragon age|veilguard|dragon age 4"],
  ["Dragon Age: Inquisition", "драгон эйдж|эпоха драконов|инквизиция|dragon age|inquisition|dragon age 3"],
  ["Dragon Age: Origins", "драгон эйдж|эпоха драконов|драгон эйдж ориджинс|dragon age|dragon age origins|dragon age 1"],
  ["Final Fantasy VII Rebirth", "файнал фэнтези|файнал фентези|финалка|фф|ff|final fantasy|фф7|ff7|ребирт|ребёрт|rebirth|ff7 rebirth"],
  ["Final Fantasy VII Remake Intergrade", "файнал фэнтези 7|фф7|ff7|ff7 remake|final fantasy 7 remake"],
  ["Final Fantasy XIV", "файнал фэнтези|файнал фентези|финалка|фф|ff|final fantasy|фф14|ff14|ffxiv|final fantasy 14 online"],
  ["Final Fantasy XVI", "файнал фэнтези|файнал фентези|финалка|фф|ff|final fantasy|фф16|ff16|ffxvi"],
  ["Monster Hunter Wilds", "монстр хантер|монхан|мх|mh|monster hunter|вайлдс|мх вайлдс|mh wilds|mhwilds"],
  ["Monster Hunter: World", "монстр хантер|монхан|мх|mh|monster hunter|мх ворлд|mhw|mh world"],
  ["Monster Hunter Rise", "монстр хантер|монхан|monster hunter|мх райз|mhr|mh rise"],
  ["Persona 5 Royal", "персона|персона 5|п5|п5р|p5|p5r|persona|persona 5"],
  ["Persona 3 Reload", "персона|персона 3|п3р|p3r|persona|persona 3"],
  ["Like a Dragon: Infinite Wealth", "якудза|лайк э драгон|лайк а драгон|yakuza|like a dragon|infinite wealth"],
  ["Yakuza 0", "якудза|якудза 0|якудза зеро|yakuza|yakuza zero"],

  // Ubisoft and other open worlds
  ["Assassin's Creed Shadows", "ассасин|асасин|ассассин|ассасин крид|асасин крид|ассасинс крид|кредо убийцы|ac|assassin|assassins creed|ассасин шедоус|шадоус|шэдоус|shadows|ac shadows"],
  ["Assassin's Creed Valhalla", "ассасин|асасин|ассассин|ассасин крид|асасин крид|ассасинс крид|кредо убийцы|ac|assassin|assassins creed|вальгалла|вальхалла|valhalla|ac valhalla|acv"],
  ["Assassin's Creed Odyssey", "ассасин|асасин|ассассин|ассасин крид|асасин крид|ассасинс крид|кредо убийцы|ac|assassin|assassins creed|одиссея|odyssey|ac odyssey|aco"],
  ["Assassin's Creed Origins", "ассасин|асасин|ассассин|ассасин крид|асасин крид|ассасинс крид|кредо убийцы|ac|assassin|assassins creed|истоки|ориджинс|ac origins"],
  ["Assassin's Creed Mirage", "ассасин крид мираж|мираж|mirage|ac mirage"],
  ["Assassin's Creed IV Black Flag", "ассасин крид 4|ассасин 4|черный флаг|блэк флэг|ac4|black flag"],
  ["Assassin's Creed II", "ассасин крид 2|ассасин 2|эцио|ac2|assassins creed 2"],
  ["Far Cry 6", "фар край|фаркрай|far cry|farcry|фар край 6|fc6"],
  ["Far Cry 5", "фар край|фаркрай|far cry|farcry|фар край 5|fc5"],
  ["Far Cry 3", "фар край|фаркрай|far cry|farcry|фар край 3|fc3"],
  ["Far Cry 4", "фар край 4|fc4"],
  ["Far Cry Primal", "фар край примал|примал|far cry primal"],
  ["Watch Dogs: Legion", "вотч догс|воч догс|легион|watch dogs|legion|watch dogs legion"],
  ["Watch Dogs 2", "вотч догс|воч догс|вотч догс 2|watch dogs|watch dogs 2"],
  ["Tom Clancy's The Division 2", "дивижн|дивижен|дивизия|дивижн 2|division|the division|division 2"],
  ["Hitman: World of Assassination", "хитман|хитмэн|агент 47|hitman|hitman 3"],
  ["Mafia: The Old Country", "мафия|мафия олд кантри|олд кантри|мафия 4|mafia|old country|mafia 4"],
  ["Mafia: Definitive Edition", "мафия|мафия 1|mafia|mafia 1"],
  ["Mafia II: Definitive Edition", "мафия|мафия 2|mafia|mafia 2"],
  ["Mafia III: Definitive Edition", "мафия 3|mafia 3"],
  ["Borderlands 4", "бордерлендс|бордерлэндс|бордерлендс 4|borderlands|bl4"],
  ["Borderlands 3", "бордерлендс|бордерлэндс|бордерлендс 3|borderlands|bl3"],
  ["Borderlands 2", "бордерлендс|бордерлэндс|бордерлендс 2|borderlands|bl2"],
  ["Payday 2", "пейдей|пэйдэй|пейдей 2|пд2|pd2|payday"],
  ["Payday 3", "пейдей|пэйдэй|пейдей 3|пд3|pd3|payday"],
  ["Dead Island 2", "дед айленд|дэд айленд|дед айленд 2|dead island"],
  ["Dying Light: The Beast", "дайн лайт|даинг лайт|дайинг лайт|умирающий свет|дайн лайт бист|dying light|the beast"],
  ["Dying Light 2 Stay Human", "дайн лайт|даинг лайт|дайинг лайт|умирающий свет|дайн лайт 2|dying light|dying light 2|dl2"],
  ["Dying Light", "дайн лайт|даинг лайт|дайинг лайт|умирающий свет|дайн лайт 1|dying light 1"],

  // id, Valve and other PC classics
  ["Doom: The Dark Ages", "дум|думгай|темные века|дум дарк эйджес|doom|dark ages"],
  ["Doom Eternal", "дум|думгай|дум этернал|дум етернал|doom|eternal"],
  ["Doom", "дум|думгай|дум 2016|doom|doom 2016"],
  ["Half-Life 2", "халф лайф|халфа|халва|халф лайф 2|гордон фримен|hl|hl2|half life|half life 2"],
  ["Half-Life: Alyx", "халф лайф|халф лайф аликс|аликс|алекс|hla|half life|alyx"],
  ["Half-Life", "халф лайф|халф лайф 1|hl1|half life|half life 1"],
  ["Portal 2", "портал|портал 2|portal|portal 2"],
  ["Portal", "портал|портал 1|portal|portal 1"],
  ["Left 4 Dead 2", "лефт фо дед|лефт 4 дед|л4д|л4д2|l4d|l4d2|left 4 dead|left for dead"],
  ["Team Fortress 2", "тф2|tf2|тим фортресс|тим фортресс 2|team fortress"],
  ["Garry's Mod", "гмод|гаррис мод|гарис мод|gmod|garrys mod|garry mod"],
  ["Destiny 2", "дестини|дестени|дестини 2|destiny"],
  ["Warframe", "варфрейм|варфрем|варфрэйм|warframe"],
  ["Sea of Thieves", "си оф тивз|си оф сивз|море воров|sot|sea of thieves"],
  ["No Man's Sky", "но мэнс скай|ноу мэнс скай|нмс|nms|ничье небо|no mans sky"],
  ["It Takes Two", "ит тейкс ту|ит тэйкс ту|нужны двое|itt|it takes two"],
  ["Split Fiction", "сплит фикшн|сплит фикшен|split fiction"],
  ["A Way Out", "э вей аут|эй вей аут|a way out"],
  ["Fall Guys", "фол гайс|фолл гайс|фолгайс|фалл гайс|fall guys", "other"],
  ["Squad", "сквад|squad"],
  ["Arma 3", "арма|арма 3|arma|arma 3"],
  ["Arma Reforger", "арма|арма реформер|реформер|arma|reforger|arma reforger"],
  ["Hell Let Loose", "хелл лет лус|хел лет лус|hll|hell let loose"],
  ["Insurgency: Sandstorm", "инсургенси|инсурдженси|инсурженси|сэндсторм|insurgency|insurgency sandstorm"],
  ["Ready or Not", "реди ор нот|реди ор нат|рон|ready or not"],
  ["Gray Zone Warfare", "грей зон|грей зон варфейр|gzw|gray zone|grey zone"],

  // Strategy
  ["Warhammer 40,000: Space Marine 2", "спейс марин|спейс марин 2|спейс марине|вархаммер|вархамер|ваха|см2|sm2|space marine|space marine 2|warhammer|warhammer 40000"],
  ["Total War: Warhammer III", "тотал вар|тотал вар вархаммер|тотал вар вархаммер 3|вархаммер|вархамер|ваха|твв3|twwh3|total war|total war warhammer|warhammer"],
  ["Warhammer 40,000: Darktide", "дарктайд|вархаммер дарктайд|ваха|darktide"],
  ["Sid Meier's Civilization VII", "цива|цивилизация|сид мейер|цива 7|цивилизация 7|civ|civilization|civ 7|civilization 7"],
  ["Sid Meier's Civilization VI", "цива|цивилизация|сид мейер|цива 6|цивилизация 6|civ|civilization|civ 6|civilization 6"],
  ["Sid Meier's Civilization V", "цива 5|цивилизация 5|civ 5|civilization 5"],
  ["Heroes of Might & Magic III", "герои|герои 3|герои меча и магии|герои меча и магии 3|хомм|хомм 3|homm|homm3|heroes|heroes 3|heroes of might and magic|heroes of might and magic 3"],
  ["Heroes of Might & Magic: Olden Era", "герои|герои меча и магии|олден эра|герои олден эра|хомм|homm|heroes|olden era|heroes olden era|heroes of might and magic"],
  ["Stellaris", "стелларис|стеларис|stellaris"],
  ["Hearts of Iron IV", "хойка|хои|хои 4|хартс оф айрон|hoi|hoi4|hearts of iron|hearts of iron 4"],
  ["Europa Universalis V", "европа|европа универсалис|европа 5|еу5|eu5|eu|europa|europa universalis|europa universalis 5"],
  ["Europa Universalis IV", "европа|европа универсалис|европа 4|еу4|eu4|eu|europa|europa universalis|europa universalis 4"],
  ["Crusader Kings III", "крестоносцы|крусейдер кингс|крузейдер кингс|цк3|ck3|crusader kings|crusader kings 3"],
  ["Age of Empires II", "эпоха империй|эпоха империй 2|аое|аое2|aoe|aoe2|age of empires|age of empires 2"],
  ["Age of Empires IV", "эпоха империй|эпоха империй 4|аое|аое4|aoe|aoe4|age of empires|age of empires 4"],
  ["Mount & Blade II: Bannerlord", "баннерлорд|банерлорд|маунт энд блейд|маунт и блейд|маунт энд блейд 2|mb2|bannerlord|mount and blade|mount and blade 2"],
  ["Mount & Blade: Warband", "варбанд|маунт энд блейд|маунт и блейд|warband|mount and blade|mount and blade warband"],
  ["Kenshi", "кенши|kenshi"],
  ["Frostpunk 2", "фростпанк|фростпанк 2|frostpunk|frostpunk 2"],
  ["Manor Lords", "манор лордс|манор лорд|manor lords"],
  ["XCOM 2", "икском|икском 2|xcom|xcom 2"],
  ["Stronghold Crusader", "стронгхолд|стронгхолд крусейдер|стронгхолд крестоносец|крепость|stronghold|stronghold crusader"],
  ["Factorio", "факторио|факторка|factorio"],
  ["Satisfactory", "сатисфактори|сатисфэктори|satisfactory"],
  ["RimWorld", "римворлд|римворд|рим ворлд|rimworld|rim world"],

  // Indie
  ["Cuphead", "капхед|капхэд|кап хед|чашкоголовый|cuphead"],
  ["Dead Cells", "дед селлс|дэд селлс|дед селс|dead cells"],
  ["Slay the Spire 2", "слей зе спайр|слэй зе спайр|sts|sts2|slay the spire|slay the spire 2"],
  ["Slay the Spire", "слей зе спайр|слэй зе спайр|sts|sts 1|slay the spire|slay the spire 1"],
  ["Balatro", "балатро|balatro"],
  ["Vampire Survivors", "вампир сурвайворс|вампир сурвайвор|вампиры|vampire survivors"],
  ["Undertale", "андертейл|андертэйл|undertale"],
  ["Deltarune", "дельтарун|дельтарюн|deltarune"],
  ["Brawlhalla", "бравлхалла|бравлхала|brawlhalla"],
  ["Overcooked! 2", "оверкукед|оверкукд|оверкукед 2|overcooked|overcooked 2"],
  ["The Outlast Trials", "аутласт|аутласт триалс|outlast|outlast trials"],
  ["Outlast", "аутласт|аутласт 1|outlast|outlast 1"],

  // Nintendo and Xbox
  ["Pokémon Legends: Z-A", "покемон|покемоны|покимон|pokemon|покемон легендс за|легендс за|pokemon za|pokemon legends za", "other"],
  ["Pokémon Scarlet", "покемон|покемоны|покимон|pokemon|покемон скарлет|скарлет|pokemon scarlet|scarlet", "other"],
  ["Pokémon Violet", "покемон|покемоны|покимон|pokemon|покемон вайолет|вайолет|pokemon violet|violet", "other"],
  ["Pokémon Legends: Arceus", "покемон арцеус|арцеус|arceus|pokemon arceus|pokemon legends arceus", "other"],
  ["The Legend of Zelda: Tears of the Kingdom", "зельда|зелда|легенда о зельде|линк|зельда тотк|тотк|слезы королевства|zelda|totk|tears of the kingdom", "other"],
  ["The Legend of Zelda: Breath of the Wild", "зельда|зелда|легенда о зельде|линк|зельда ботв|ботв|дыхание дикой природы|zelda|botw|breath of the wild", "other"],
  ["The Legend of Zelda: Echoes of Wisdom", "зельда|зелда|эхо мудрости|zelda|echoes of wisdom", "other"],
  ["Mario Kart 8 Deluxe", "марио карт|мариокарт|марио карт 8|мк8|марио|супер марио|mario kart|mariokart|mario kart 8|mk8|mario", "other"],
  ["Mario Kart World", "марио карт|мариокарт|марио карт ворлд|марио|mario kart|mariokart|mario kart world|mario", "other"],
  ["Super Mario Odyssey", "марио|супер марио|марио одиссей|одиссея марио|mario|super mario|mario odyssey", "other"],
  ["Super Mario Bros. Wonder", "марио|супер марио|марио вандер|марио бразерс|mario|super mario|mario wonder|mario bros", "other"],
  ["Super Mario Party Jamboree", "марио пати|марио пати джамбори|mario party|super mario party|mario party jamboree", "other"],
  ["Super Smash Bros. Ultimate", "смэш|смеш|смаш|смэш брос|смеш брос|смэш бразерс|супер смэш брос|smash|smash bros|super smash bros|ssbu", "other"],
  ["Animal Crossing: New Horizons", "энимал кроссинг|энимал кросинг|анимал кроссинг|энимал|animal crossing|acnh|ac nh", "other"],
  ["Splatoon 3", "сплатун|сплатун 3|splatoon", "other"],
  ["Donkey Kong Bananza", "донки конг|донки|бананза|donkey kong|bananza|dk", "other"],
  ["Metroid Prime 4: Beyond", "метроид|метроид прайм|метроид прайм 4|metroid|metroid prime|metroid prime 4", "other"],
  ["Pikmin 4", "пикмин|пикмин 4|pikmin", "other"],
  ["Luigi's Mansion 3", "луиджи|луиджис меншн|luigi|luigis mansion", "other"],
  ["Halo Infinite", "хало|хейло|хало инфинит|мастер чиф|halo"],
  ["Halo: The Master Chief Collection", "хало|хейло|мастер чиф|halo|halo mcc|mcc|master chief collection"],
  ["Gears of War: Reloaded", "гирс|гирс оф вар|gears|gears of war"],
  ["Indiana Jones and the Great Circle", "индиана джонс|индиана|indiana jones|great circle"],
];

// ── Normalization ──────────────────────────────────────────────────────────

const ROMAN = /^(x{0,3})(ix|iv|v?i{0,3})$/;
const ROMAN_DIGITS: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

/** "vi" -> "6", "xiv" -> "14"; a lone "i" only at the end ("Part I"), never "I Am Bread". */
function romanToDigits(token: string, last: boolean): string {
  const match = ROMAN.exec(token);
  if (!match || !token || (token === "i" && !last)) return token;
  return String(match[1].length * 10 + (ROMAN_DIGITS[match[2]] ?? 0));
}

/**
 * The form queries, aliases and titles are compared in: lowercase without
 * accents (so ё -> е, й -> и), no apostrophes, abbreviation dots dropped
 * ("S.T.A.L.K.E.R." -> "stalker"), "&" read as "and", other punctuation as a
 * space, letters and digits split ("cs2" -> "cs 2") and Roman numerals written
 * as digits ("GTA VI" -> "gta 6").
 */
export function gameSearchKey(value: string): string {
  const tokens = normalizeGameName(value)
    .replace(/['’‘`ʼ]/g, "")
    .replace(/(?<![\p{L}\p{N}])(\p{L})\.(?=\p{L}|\s|$|[:\-–—])/gu, "$1")
    .replace(/&/g, " and ")
    .replace(/(\p{L})(?=\p{N})|(\p{N})(?=\p{L})/gu, "$1$2 ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return tokens.map((token, index) => romanToDigits(token, index === tokens.length - 1 && tokens.length > 1)).join(" ");
}

// ЙЦУКЕН -> QWERTY: "пеф" is "gta" typed with the Russian layout on.
const RUSSIAN_LAYOUT = "йцукенгшщзхъфывапролджэячсмитьбюё";
const LATIN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";

function fromRussianLayout(value: string): string {
  return [...value.toLowerCase()].map((char) => LATIN_LAYOUT[RUSSIAN_LAYOUT.indexOf(char)] ?? char).join("");
}

// ── Lookup ─────────────────────────────────────────────────────────────────

interface AliasIndex {
  /** Alias key -> row numbers in table order. */
  rows: Map<string, number[]>;
  /** Every alias key with its rows, for prefix lookups. */
  keys: [key: string, rows: number[]][];
}

let index: AliasIndex | null = null;

/** Built on first use, so clients that never search do not pay for it. */
function aliasIndex(): AliasIndex {
  if (index) return index;
  const rows = new Map<string, number[]>();
  GAME_ALIASES.forEach(([title, aliases], row) => {
    for (const alias of [title, ...aliases.split("|")]) {
      const key = gameSearchKey(alias);
      if (!key) continue;
      const list = rows.get(key) ?? [];
      if (!list.includes(row)) list.push(row);
      rows.set(key, list);
    }
  });
  index = { rows, keys: [...rows.entries()] };
  return index;
}

export interface GameAliasMatch {
  title: string;
  store: GameStore;
  /** The query is an alias (or an alias followed by words of the title); otherwise it only starts one ("ведьм"). */
  exact: boolean;
  /**
   * "fallout 2", "хитман 2": the query is a series alias and a number no
   * title of that series in the table has, so the typed game is not in the
   * table and this match is another game of the series (never exact).
   */
  sequel?: { alias: string; number: number };
}

const MAX_PREFIX_MATCHES = 4;

function lookup(key: string, limit: number): GameAliasMatch[] {
  const { rows, keys } = aliasIndex();
  const exact: number[] = [...(rows.get(key) ?? [])];
  const partial = new Set<number>();
  let series: number[] = [];
  let sequel: GameAliasMatch["sequel"];
  if (!exact.length) {
    // "ведьмак 3 дикая охота кровь и вино", "гта 5 рп сервер": the longest alias
    // the query starts with, narrowed to the titles that contain the rest. A
    // Latin rest is left to the stores ("minecraft dungeons" is another game).
    let best = "";
    for (const [alias] of keys) if (alias.length > best.length && key.startsWith(`${alias} `)) best = alias;
    if (best) {
      const rest = key.slice(best.length + 1);
      const candidates = rows.get(best)!;
      if (/^\d+$/.test(rest)) {
        // A number names the title that has it as a word ("фоллаут 76", not
        // "фоллаут 7"); a number none has is a game the table does not know.
        const numbered = candidates.filter((row) => ` ${gameSearchKey(GAME_ALIASES[row][0])} `.includes(` ${rest} `));
        if (numbered.length) exact.push(...numbered);
        else {
          series = candidates;
          sequel = { alias: best, number: Number(rest) };
        }
      } else {
        const titled = candidates.filter((row) => gameSearchKey(GAME_ALIASES[row][0]).includes(rest));
        if (titled.length) exact.push(...titled);
        else if (!/[a-z]/.test(rest)) exact.push(...candidates);
      }
    }
  }
  // The query only starts an alias ("гт", "ведьм", "hollow kn"): the most played matches, after the exact ones.
  // Next to an exact match only longer names of the same word count ("кс" -> "кс го", not "вот" -> "вотч догс").
  if (key.length >= 2) {
    const prefix = exact.length ? `${key} ` : key;
    for (const [alias, aliasRows] of keys) {
      if (alias.length > key.length && alias.startsWith(prefix)) for (const row of aliasRows) partial.add(row);
    }
  }
  const seen = new Set<number>();
  const matches: GameAliasMatch[] = [];
  for (const row of exact.sort((a, b) => a - b)) {
    if (seen.has(row)) continue;
    seen.add(row);
    matches.push({ title: GAME_ALIASES[row][0], store: GAME_ALIASES[row][2] ?? "steam", exact: true });
  }
  let partialCount = 0;
  for (const row of [...partial].sort((a, b) => a - b)) {
    if (seen.has(row) || partialCount >= MAX_PREFIX_MATCHES) continue;
    seen.add(row);
    partialCount += 1;
    matches.push({ title: GAME_ALIASES[row][0], store: GAME_ALIASES[row][2] ?? "steam", exact: false });
  }
  // The rest of the series follows the game the stores find for "fallout 2".
  for (const row of series) {
    if (seen.has(row)) continue;
    seen.add(row);
    matches.push({ title: GAME_ALIASES[row][0], store: GAME_ALIASES[row][2] ?? "steam", exact: false, sequel });
  }
  return matches.slice(0, limit);
}

/**
 * Canonical games a search query names: exact aliases first (in table order),
 * then up to four games whose alias the query starts. A Cyrillic query that
 * matches nothing is retried as if typed with the English layout ("пеф").
 */
export function findGameAliases(query: string, limit = 8): GameAliasMatch[] {
  const key = gameSearchKey(query);
  if (!key) return [];
  const matches = lookup(key, limit);
  if (matches.length || !/^[\p{Script=Cyrillic}\s]+$/u.test(query.trim())) return matches;
  const latin = gameSearchKey(fromRussianLayout(query.trim()));
  if (latin.length < 2) return [];
  return lookup(latin, limit).filter((match) => match.exact || latin.length >= 3);
}

/**
 * The canonical game a saved title stands for: itself when it is a canonical
 * title, or the one game of an exact alias ("гта 6" -> Grand Theft Auto VI).
 * Null for aliases of a whole series ("гта") and unknown titles.
 */
export function canonicalGame(name: string): { title: string; store: GameStore } | null {
  const key = gameSearchKey(name);
  if (!key) return null;
  const rows = aliasIndex().rows.get(key) ?? [];
  const own = rows.find((row) => gameSearchKey(GAME_ALIASES[row][0]) === key);
  const row = own ?? (rows.length === 1 ? rows[0] : undefined);
  if (row === undefined) return null;
  return { title: GAME_ALIASES[row][0], store: GAME_ALIASES[row][2] ?? "steam" };
}

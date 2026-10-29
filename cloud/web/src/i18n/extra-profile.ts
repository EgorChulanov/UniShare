// Additional strings for the profile screens (ru / en / uk / be).
type Dict = Record<string, string>;

export const profileStrings: Record<"ru" | "en" | "uk" | "be", Dict> = {
  ru: {
    "transparency.nearby.title": "QR-код рядом",
    "transparency.nearby.detail": "В разделе «Рядом» покажите свой QR-код или отсканируйте чужой — анкета откроется сразу. Передаётся только ссылка на публичную анкету.",
    "transparency.credentials.title": "Без паролей и платежей",
    "transparency.data.title": "Ваши данные",
    "transparency.data.detail": "Контакты Telegram и ВКонтакте видны собеседнику только после мэтча и только с вашего разрешения. Данные хранятся на серверах в России.",
  },
  en: {
    "transparency.nearby.title": "Nearby QR code",
    "transparency.nearby.detail": "In Nearby, show your QR code or scan someone else's to open their profile instantly. Only a link to the public profile is shared.",
    "transparency.credentials.title": "No passwords or payments",
    "transparency.data.title": "Your data",
    "transparency.data.detail": "Your Telegram and VK contacts are visible to a partner only after a match and only if you allow it. Data is stored on servers in Russia.",
  },
  uk: {
    "transparency.nearby.title": "QR-код поруч",
    "transparency.nearby.detail": "У розділі «Поруч» покажіть свій QR-код або відскануйте чужий — анкета відкриється одразу. Передається лише посилання на публічну анкету.",
    "transparency.credentials.title": "Без паролів і платежів",
    "transparency.data.title": "Ваші дані",
    "transparency.data.detail": "Контакти Telegram і ВКонтакте видно співрозмовнику лише після метчу й лише з вашого дозволу. Дані зберігаються на серверах у Росії.",
  },
  be: {
    "transparency.nearby.title": "QR-код побач",
    "transparency.nearby.detail": "У раздзеле «Побач» пакажыце свой QR-код або адсканіруйце чужы — анкета адкрыецца адразу. Перадаецца толькі спасылка на публічную анкету.",
    "transparency.credentials.title": "Без пароляў і плацяжоў",
    "transparency.data.title": "Вашы даныя",
    "transparency.data.detail": "Кантакты Telegram і ВКонтакте бачныя суразмоўцу толькі пасля мэтчу і толькі з вашага дазволу. Даныя захоўваюцца на серверах у Расіі.",
  },
};

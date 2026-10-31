// Additional strings for the chats screens (ru / en / uk / be).
type Dict = Record<string, string>;

export const chatsStrings: Record<"ru" | "en" | "uk" | "be", Dict> = {
  ru: {
    "chats.request.skills": "хочет познакомиться по навыкам",
    "chat.attach": "Прикрепить фото",
    "chat.more": "Ещё",
    "chat.back": "Назад",
    "chat.delete.confirm": "Удалить чат? Он исчезнет из вашего списка до нового сообщения.",
    "chat.deleted": "Чат удалён",
    "chat.you": "Вы: ",
  },
  en: {
    "chats.request.skills": "wants to connect on skills",
    "chat.attach": "Attach photo",
    "chat.more": "More",
    "chat.back": "Back",
    "chat.delete.confirm": "Delete this chat? It disappears from your list until a new message arrives.",
    "chat.deleted": "Chat deleted",
    "chat.you": "You: ",
  },
  uk: {
    "chats.request.skills": "хоче познайомитися за навичками",
    "chat.attach": "Прикріпити фото",
    "chat.more": "Ще",
    "chat.back": "Назад",
    "chat.delete.confirm": "Видалити чат? Він зникне зі списку до нового повідомлення.",
    "chat.deleted": "Чат видалено",
    "chat.you": "Ви: ",
  },
  be: {
    "chats.request.skills": "хоча пазнаёміцца па навыках",
    "chat.attach": "Прымацаваць фота",
    "chat.more": "Яшчэ",
    "chat.back": "Назад",
    "chat.delete.confirm": "Выдаліць чат? Ён знікне са спіса да новага паведамлення.",
    "chat.deleted": "Чат выдалены",
    "chat.you": "Вы: ",
  },
};

import { getGeoMeta } from "@/data/geoMeta";

const PROMPT_TEMPLATE = `Задача: собрать список сайтов-кандидатов для Google Display placements под нужное гео.

ВХОДНЫЕ ПАРАМЕТРЫ (заполни перед запуском):
- GEO: {GEO}
- LANGUAGE: {LANGUAGE}
- DOMAIN_HINT: {DOMAIN_HINT}
- EXEMPLARS: {EXEMPLARS}
- SECTIONS_FOCUS: magazin/lifestyle, celebrity/entertainment, health, senior/pension/retirement, local human-interest
- AUDIENCE: 35–65

Если EXEMPLARS пустые:
- сначала предложи 3 вероятных эталона этого гео (local soft-news / magazine / senior-health portals),
- затем ищи сайты того же класса.

Нужны сайты ТОГО ЖЕ КЛАССА, не любые сайты страны.

Критерии включения (все обязательные):
1) Контент на LANGUAGE, аудитория GEO
2) Тип: новостной / журнал / локальный портал с article-страницами
3) Есть мягкие рубрики минимум 2 из:
   - magazine / lifestyle / entertainment / celebrity
   - health / wellness
   - senior / pension / retirement / aging
   - local human-interest / odd news / “most read”
4) Вероятна Google-реклама (AdSense/AdX/GDN), не только Taboola/MGID/Outbrain/teaser-сети
5) Аудитория скорее 35–65, не подростковый/мем-контент
6) Не премиум brand-safe медиа с жёсткой модерацией рекламы
7) Не лендинги, не ecom, не гос/банки/универы, не корпоративные блоги

Критерии исключения:
- только teaser-сети без Google
- чистый спорт / hard politics / business-only без soft-секций
- премиум quality press / public broadcaster (низкий приоритет или reject)
- мёртвые/малостраничные сайты
- другой язык или другой geo-фокус

Логика приоритета:
- P0: почти клон EXEMPLARS или явный local soft-media с нужными рубриками
- P1: крупный local portal с soft-секциями + вероятный Google stack
- P2: niche health/senior/lifestyle, слабее похож, но стоит проверить

Формат ответа — таблица:
domain | country | language | why_similar | main_sections | audience_proxy | google_ads_likely | priority(P0/P1/P2) | example_article_urls

Правила выдачи:
1) Сначала 30 доменов, потом ещё 30, без повторов
2) Для каждого домена дай 2–5 конкретных article URL из нужных рубрик
3) Не давай homepage как единственный URL
4) Если GEO не Словения — не опирайся на .si примеры, ищи локальные аналоги
5) В конце отдельным блоком выдай CLEAN LIST доменов для копирования`;

export function buildPlacementPrompt(opts: {
  countryCode: string;
  exemplars?: string[];
}): string {
  const meta = getGeoMeta(opts.countryCode);
  const exemplars =
    opts.exemplars && opts.exemplars.length > 0
      ? opts.exemplars.slice(0, 3).join(", ")
      : "(пусто — предложи 3 эталона сам)";

  return PROMPT_TEMPLATE.replace("{GEO}", meta.geoEn)
    .replace("{LANGUAGE}", meta.language)
    .replace("{DOMAIN_HINT}", meta.domainHint)
    .replace("{EXEMPLARS}", exemplars);
}

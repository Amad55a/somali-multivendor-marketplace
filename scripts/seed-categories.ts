import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const parents = [
  ["Clothing & Fashion", "Dharka iyo Moodada", "clothing-fashion"],
  ["Electronics", "Elektaroonig", "electronics"],
  ["Phones & Accessories", "Taleefanno iyo Agabkooda", "phones-accessories"],
  ["Food & Grocery", "Cunto iyo Raashin", "food-grocery"],
  ["Beauty & Cosmetics", "Quruxda iyo Isqurxinta", "beauty-cosmetics"],
  ["Health & Pharmacy", "Caafimaadka iyo Farmashiyaha", "health-pharmacy"],
  ["Home & Furniture", "Guriga iyo Alaabta Guriga", "home-furniture"],
  ["Agriculture & Livestock", "Beeraha iyo Xoolaha", "agriculture-livestock"],
  ["Automotive", "Gaadiidka iyo Agabka Baabuurta", "automotive"],
  ["Sports & Outdoors", "Ciyaaraha iyo Agabka Dibadda", "sports-outdoors"],
  ["Books & Education", "Buugaagta iyo Waxbarashada", "books-education"],
  ["Services", "Adeegyada", "services"],
  ["Baby & Kids", "Carruurta iyo Agabkooda", "baby-kids"],
  ["Other", "Kale", "other"],
] as const;

const children: Record<string, ReadonlyArray<readonly [string, string, string]>> = {
  "clothing-fashion": [
    ["Men's clothing", "Dharka ragga", "mens-clothing"],
    ["Women's clothing", "Dharka dumarka", "womens-clothing"],
    ["Dirac & traditional wear", "Dirac iyo dhar dhaqameed", "dirac-traditional"],
    ["Shoes & bags", "Kabo iyo boorsooyin", "shoes-bags"],
  ],
  electronics: [
    ["TVs & audio", "TV iyo maqal", "tvs-audio"],
    ["Home appliances", "Qalabka guriga", "home-appliances"],
    ["Computers", "Kumbuyuutarro", "computers"],
  ],
  "phones-accessories": [
    ["Smartphones", "Taleefannada casriga", "smartphones"],
    ["Phone accessories", "Agabka taleefanka", "phone-accessories"],
  ],
  "food-grocery": [
    ["Fresh produce", "Khudaar cusub", "fresh-produce"],
    ["Spices & dry goods", "Xawaash iyo raashin qalalan", "spices-dry-goods"],
    ["Drinks", "Cabitaannada", "drinks"],
  ],
  "beauty-cosmetics": [
    ["Skincare", "Daryeelka maqaarka", "skincare"],
    ["Fragrance & incense", "Cadar iyo uunsi", "fragrance-incense"],
  ],
  "home-furniture": [
    ["Furniture", "Alaabta guriga", "furniture"],
    ["Kitchenware", "Qalabka jikada", "kitchenware"],
  ],
  other: [
    ["General merchandise", "Alaabooyin kala duwan", "general-merchandise"],
  ],
};

async function main() {
  const parentIds = new Map<string, string>();
  for (const [name, nameSo, slug] of parents) {
    const category = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, nameSo, slug, isActive: true },
    });
    parentIds.set(slug, category.id);
  }

  for (const [parentSlug, items] of Object.entries(children)) {
    const parentId = parentIds.get(parentSlug);
    if (!parentId) continue;
    for (const [name, nameSo, slug] of items) {
      await prisma.category.upsert({
        where: { slug },
        update: {},
        create: { name, nameSo, slug, isActive: true, parentId },
      });
    }
  }
}

main().finally(() => prisma.$disconnect());

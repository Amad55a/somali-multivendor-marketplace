export type LocationOption = {
  name: string;
  code: string;
};

export type RegionLocation = LocationOption & {
  cities: Record<string, string[]>;
  districts?: Record<string, string[]>;
};

export type CountryLocation = LocationOption & {
  flag: string;
  callingCode: string;
  regions: RegionLocation[];
};

export const businessTypeOptions = [
  "Retail / General Store",
  "Clothing and Fashion",
  "Electronics",
  "Food and Grocery",
  "Restaurant and Catering",
  "Beauty and Cosmetics",
  "Health and Pharmacy",
  "Agriculture and Livestock",
  "Wholesale and Distribution",
  "Services",
  "Other",
] as const;

const somaliRegions: RegionLocation[] = [
  {
    name: "Banaadir",
    code: "SO-BN",
    cities: { Mogadishu: ["Dayniile", "Hodan", "Wadajir", "Warta Nabada", "Heliwaa", "Yaqshid", "Wardhiigley / Howlwadaag", "Karaan", "Shibis", "Shangaani", "Boondheere", "Cabdicasiis", "Dharkenley", "Huriwaa", "Kaxda", "Waaberi", "Xamar Jajab", "Xamar Weyne"] },
    districts: { Mogadishu: ["Dayniile", "Hodan", "Wadajir", "Warta Nabada", "Heliwaa", "Yaqshid", "Wardhiigley / Howlwadaag", "Karaan", "Shibis", "Shangaani", "Boondheere", "Cabdicasiis", "Dharkenley", "Huriwaa", "Kaxda", "Waaberi", "Xamar Jajab", "Xamar Weyne"] },
  },
  { name: "Awdal", code: "SO-AW", cities: { Borama: [], Baki: [], Lughaya: [], Zeila: [] } },
  { name: "Woqooyi Galbeed", code: "SO-WG", cities: { Hargeisa: [], Berbera: [], Gabiley: [] } },
  { name: "Togdheer", code: "SO-TO", cities: { Burao: [], Oodweyne: [] } },
  { name: "Sanaag", code: "SO-SA", cities: { Erigavo: [], Lasqorey: [] } },
  { name: "Sool", code: "SO-SO", cities: { "Las Anod": [], Taleex: [] } },
  { name: "Bari", code: "SO-BR", cities: { Bosaso: [], Qardho: [], Caluula: [] } },
  { name: "Nugaal", code: "SO-NU", cities: { Garowe: [], Burtinle: [] } },
  { name: "Mudug", code: "SO-MU", cities: { Galkayo: [], Hobyo: [], Xarardheere: [] } },
  { name: "Galguduud", code: "SO-GA", cities: { Dusmareb: [], Cadaado: [], Guriceel: [] } },
  { name: "Hiiraan", code: "SO-HI", cities: { Beledweyne: [], Buuloburde: [] } },
  { name: "Shabeellaha Dhexe", code: "SO-SD", cities: { Jowhar: [], Balcad: [] } },
  { name: "Shabeellaha Hoose", code: "SO-SH", cities: { Marka: [], Afgooye: [], Wanlaweyn: [] } },
  { name: "Bay", code: "SO-BY", cities: { Baidoa: [], Diinsoor: [] } },
  { name: "Bakool", code: "SO-BK", cities: { Hudur: [], Rabdhure: [] } },
  { name: "Gedo", code: "SO-GE", cities: { Garbaharey: [], Luuq: [], "Beled Xaawo": [] } },
  { name: "Jubbada Dhexe", code: "SO-JD", cities: { "Bu'aale": [], Saakow: [] } },
  { name: "Jubbada Hoose", code: "SO-JH", cities: { Kismayo: [], Afmadow: [], Jamaame: [] } },
];

export const countries: CountryLocation[] = [
  { name: "Somalia", code: "SO", flag: "🇸🇴", callingCode: "+252", regions: somaliRegions },
  { name: "Kenya", code: "KE", flag: "🇰🇪", callingCode: "+254", regions: [] },
  { name: "Ethiopia", code: "ET", flag: "🇪🇹", callingCode: "+251", regions: [] },
  { name: "Djibouti", code: "DJ", flag: "🇩🇯", callingCode: "+253", regions: [] },
  { name: "Uganda", code: "UG", flag: "🇺🇬", callingCode: "+256", regions: [] },
  { name: "Tanzania", code: "TZ", flag: "🇹🇿", callingCode: "+255", regions: [] },
  { name: "United Arab Emirates", code: "AE", flag: "🇦🇪", callingCode: "+971", regions: [] },
  { name: "Saudi Arabia", code: "SA", flag: "🇸🇦", callingCode: "+966", regions: [] },
  { name: "United Kingdom", code: "GB", flag: "🇬🇧", callingCode: "+44", regions: [] },
  { name: "United States", code: "US", flag: "🇺🇸", callingCode: "+1", regions: [] },
  { name: "Canada", code: "CA", flag: "🇨🇦", callingCode: "+1", regions: [] },
];

export function findCountry(name: string | undefined) {
  return countries.find((country) => country.name === name);
}

export function findRegion(countryName: string | undefined, regionName: string | undefined) {
  return findCountry(countryName)?.regions.find((region) => region.name === regionName);
}

export function normalizePhone(countryName: string, localNumber: string): string {
  const country = findCountry(countryName);
  const digits = localNumber.replace(/\D/g, "");
  if (!country || country.callingCode === "+") return `+${digits}`;
  const codeDigits = country.callingCode.slice(1);
  return `+${digits.startsWith(codeDigits) ? digits : `${codeDigits}${digits.replace(/^0+/, "")}`}`;
}

export function isValidPhone(countryName: string, phone: string): boolean {
  const country = findCountry(countryName);
  const digits = phone.replace(/\D/g, "");
  if (!country || digits.length < 7 || digits.length > 15) return false;
  if (country.callingCode === "+") return true;
  return digits.startsWith(country.callingCode.slice(1));
}

export function isValidInternationalPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 && phone.startsWith("+");
}

export function isKnownLocation(
  countryName: string,
  regionName: string,
  cityName: string,
  districtName: string | undefined,
): boolean {
  const country = findCountry(countryName);
  if (!country) return false;
  if (country.name !== "Somalia") return true;
  if (regionName === "Other" || cityName === "Other") return true;
  const region = country.regions.find((entry) => entry.name === regionName);
  if (!region) return true;
  const cities = Object.keys(region.cities);
  if (!cities.includes(cityName)) return false;
  if (!districtName || districtName === "Other") return true;
  return region.districts?.[cityName]?.includes(districtName) ?? true;
}

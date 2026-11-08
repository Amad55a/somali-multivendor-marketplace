"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartProduct = { name: string; stock: number; variants: number; status: string };
type Labels = {
  inventoryByProduct: string;
  inventoryByProductHelp: string;
  createProductForAnalytics: string;
  catalogHealth: string;
  catalogHealthHelp: string;
  noCatalogData: string;
  unitsInStock: string;
  published: string;
  needsStock: string;
};

const colors = ["#123b35", "#f4b942", "#4d8b78", "#d97706", "#7c3aed"];

export function VendorAnalyticsCharts({
  products,
  labels,
}: Readonly<{ products: ChartProduct[]; labels: Labels }>) {
  const statusData = [
    { name: labels.published, value: products.filter((product) => product.status === "PUBLISHED").length },
    { name: labels.needsStock, value: products.filter((product) => product.stock === 0).length },
  ].filter((item) => item.value > 0);

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
        <h3 className="font-bold">{labels.inventoryByProduct}</h3>
        <p className="mt-1 text-sm text-slate-500">{labels.inventoryByProductHelp}</p>
        {products.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">{labels.createProductForAnalytics}</p>
        ) : (
          <div className="mt-5 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={products} layout="vertical" margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e1e9e5" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="stock" name={labels.unitsInStock} fill="#123b35" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-[#e1e9e5] bg-white p-5 shadow-sm">
        <h3 className="font-bold">{labels.catalogHealth}</h3>
        <p className="mt-1 text-sm text-slate-500">{labels.catalogHealthHelp}</p>
        {statusData.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">{labels.noCatalogData}</p>
        ) : (
          <div className="mt-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={94} paddingAngle={4}>
                  {statusData.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

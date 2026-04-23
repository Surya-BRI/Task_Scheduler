"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Bell,
  Search,
  Users,
  Home,
} from "lucide-react";
import { dummyProjects } from "../data/dummy-projects";

const Header = () => {
  const router = useRouter();
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b">
      <div className="flex items-center gap-2">
        <img
          src="/logo.png"
          alt="Blue Rhine Industries"
          className="h-10 object-contain cursor-pointer"
          onClick={() => router.push("/design-list")}
          title="Go to Home"
        />
      </div>
      <div className="flex items-center gap-6 text-gray-600">
        <button
          onClick={() => router.push('/design-scheduler')}
          className="hover:text-black transition-colors rounded-full hover:bg-gray-100 p-2 cursor-pointer"
          title="Go to Scheduler"
        >
          <Calendar size={20} />
        </button>
        <button className="hover:text-black transition-colors rounded-full hover:bg-gray-100 p-2 relative">
          <Bell size={20} />
          <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        <button className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden border border-gray-300">
          <div className="w-full h-full bg-slate-300 flex items-center justify-center text-slate-500">
            <Users size={20} />
          </div>
        </button>
      </div>
    </header>
  );
};

const Navigation = () => {
  const router = useRouter();
  const navItems = [
    { label: "Activities" },
    { label: "Dashboards" },
    { label: "Transactions" },
    { label: "Reports" },
    { label: "Analytics" },
    { label: "Screens" },
    { label: "Setup" },
    { label: "Support" },
  ];

  return (
    <nav className="bg-[#b3c6ea] px-6 py-3 flex items-center shadow-sm">
      <button
        onClick={() => router.push("/projects-list")}
        title="Home"
        className="text-gray-800 hover:text-black transition-colors cursor-pointer"
      >
        <Home size={18} />
      </button>
      <div className="flex-1 flex justify-around px-8">
        {navItems.map((item, index) => (
          <button
            key={index}
            className="font-semibold text-sm text-gray-800 hover:text-black transition-colors cursor-pointer"
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
};

const getCategoryColor = (category) =>
  category === "Retail" ? "text-blue-600" : "text-orange-500";

const ProjectTable = ({ data }) => (
  <div className="px-6 pb-6 flex-1 min-h-0 flex flex-col">
    <div className="border border-gray-200 rounded-lg overflow-auto bg-white shadow-sm h-full">
      <table className="w-full text-sm text-left relative">
        <thead className="bg-[#f0f3fa] text-gray-600 text-xs uppercase font-semibold sticky top-0 z-10 outline outline-1 outline-gray-200 shadow-sm">
          <tr>
            <th className="px-2 py-1 whitespace-nowrap">Project ID</th>
            <th className="px-2 py-1">Project Name</th>
            <th className="px-2 py-1 whitespace-nowrap">Sales Person</th>
            <th className="px-2 py-1 whitespace-nowrap">Category</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-2 py-0.5 text-blue-600 font-medium cursor-pointer hover:underline whitespace-nowrap text-xs">
                {row.projectId}
              </td>
              <td className="px-2 py-0.5 text-gray-700 text-xs leading-tight">
                {row.projectName}
              </td>
              <td className="px-2 py-0.5 text-gray-700 whitespace-nowrap text-xs">
                {row.salesPerson}
              </td>
              <td className={`px-2 py-0.5 font-semibold whitespace-nowrap text-xs ${getCategoryColor(row.category)}`}>
                {row.category}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export function ProjectScreen() {
  const [projects] = useState(dummyProjects);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = projects.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.projectId.toLowerCase().includes(q) ||
      p.projectName.toLowerCase().includes(q) ||
      p.salesPerson.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-screen bg-gray-50 flex flex-col font-sans overflow-hidden">
      <Header />
      <Navigation />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="shrink-0 flex items-center justify-between mt-6 mb-4 px-6">
          <h1 className="text-2xl font-bold text-gray-900">Project Design</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Project ID..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        <ProjectTable data={filtered} />
      </div>
    </div>
  );
}

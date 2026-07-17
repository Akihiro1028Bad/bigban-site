import type { Metadata } from "next";

import { AnalyticsClient } from "./AnalyticsClient";
import "./analytics.css";

export const metadata: Metadata = { title: "経営ボード" };

export default function AnalyticsPage() { return <AnalyticsClient />; }

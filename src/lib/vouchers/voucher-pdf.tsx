/**
 * Printable gift-voucher PDF (A5 portrait) — built with @react-pdf/renderer.
 * A guest can print this as a real gift: experience hero photo, the amount, the
 * code, who it's from/for, validity and redeem steps. Call renderVoucherPdf().
 */
/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer <Image> is not an HTML img */
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

const TEAL = "#00374a";
const CYAN = "#0aa3c7";
const GREY = "#6a7a80";
const LIGHT = "#e3ecee";
const NP7_EXPERIENCE_LOGO = "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/logos/np7-experience-logo.png";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", color: TEAL, fontSize: 10 },
  hero: { height: 150, width: "100%", objectFit: "cover" },
  heroFallback: { height: 150, width: "100%", backgroundColor: TEAL },
  body: { padding: 28 },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: CYAN, fontFamily: "Helvetica-Bold", textTransform: "uppercase", marginBottom: 6 },
  title: { fontSize: 24, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 2 },
  exp: { fontSize: 12, color: GREY, marginBottom: 18 },
  amount: { fontSize: 40, fontFamily: "Helvetica-Bold", color: TEAL, marginBottom: 14 },
  row: { flexDirection: "row", marginBottom: 4 },
  lbl: { width: 60, color: GREY },
  val: { flex: 1, fontFamily: "Helvetica-Bold", color: TEAL },
  message: { marginTop: 12, marginBottom: 16, fontStyle: "italic", color: "#41566a", lineHeight: 1.5 },
  codeBox: { marginTop: 8, padding: 12, borderWidth: 1, borderColor: LIGHT, borderRadius: 4, backgroundColor: "#f6fafb", alignItems: "center" },
  codeLabel: { fontSize: 7, letterSpacing: 1.5, color: GREY, textTransform: "uppercase", marginBottom: 4 },
  code: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: TEAL },
  steps: { marginTop: 18, fontSize: 9, color: GREY, lineHeight: 1.6 },
  footer: { position: "absolute", bottom: 22, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: GREY },
});

export type VoucherPdfData = {
  code: string;
  amountLabel: string;        // e.g. "€150"
  experienceTitle: string;
  recipientName: string | null;
  fromName: string | null;
  message: string | null;
  validUntil: string | null;  // formatted date
  heroImage: string | null;
  legalName: string | null;   // issuing entity (Surfcenter Experience B.V.)
};

function VoucherDoc({ d }: { d: VoucherPdfData }) {
  return (
    <Document>
      <Page size="A5" style={s.page}>
        {d.heroImage ? <Image src={d.heroImage} style={s.hero} /> : <View style={s.heroFallback} />}
        <View style={s.body}>
          <Image src={NP7_EXPERIENCE_LOGO} style={{ width: 90, marginBottom: 14 }} />
          <Text style={s.eyebrow}>Gift Voucher</Text>
          <Text style={s.title}>{d.amountLabel}</Text>
          <Text style={s.exp}>towards {d.experienceTitle}</Text>

          {d.recipientName ? <View style={s.row}><Text style={s.lbl}>For</Text><Text style={s.val}>{d.recipientName}</Text></View> : null}
          {d.fromName ? <View style={s.row}><Text style={s.lbl}>From</Text><Text style={s.val}>{d.fromName}</Text></View> : null}
          {d.message ? <Text style={s.message}>“{d.message}”</Text> : null}

          <View style={s.codeBox}>
            <Text style={s.codeLabel}>Voucher code</Text>
            <Text style={s.code}>{d.code}</Text>
          </View>

          <Text style={s.steps}>
            Redeem at np-seven.com — sign in (or create your free account) and enter this code on your trip, or simply reply to your confirmation email and we&apos;ll apply it.
            {d.validUntil ? `\nValid until ${d.validUntil}.` : ""}
          </Text>
        </View>
        <View style={s.footer}>
          <Text>{d.legalName ?? "NP7 Experience"}</Text>
          <Text>Premium watersports travel</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderVoucherPdf(d: VoucherPdfData): Promise<Buffer> {
  return renderToBuffer(<VoucherDoc d={d} /> as unknown as Parameters<typeof renderToBuffer>[0]);
}

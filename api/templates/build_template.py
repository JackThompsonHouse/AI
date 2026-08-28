"""
Converts the Roc Sales Proposal .dotx into a docxtemplater-compatible .docx.
Operates on the parsed XML tree (not raw string replace) so it's robust to
however Word split runs internally.
"""
import copy
import re
import zipfile
import shutil
from xml.etree import ElementTree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
WNS = "{%s}" % W

SRC = "/mnt/c/GIT/AI/api/templates/sow-source.dotx"
OUT_DOCX = "/mnt/c/GIT/AI/api/templates/sow-template.docx"

def register_source_namespaces(raw_xml_text):
    """ElementTree only reuses a namespace's ORIGINAL prefix on output if
    that (prefix, uri) pair was registered before parsing - otherwise it
    invents ns0:/ns1:/etc, which breaks docxtemplater (its docx module
    specifically looks for the literal "w:" prefix). Pull every xmlns:*
    declaration straight off the source root element so output matches."""
    start = raw_xml_text.find("<w:document")
    end = raw_xml_text.find(">", start) + 1
    root_tag = raw_xml_text[start:end]
    pairs = re.findall(r'xmlns:(\w+)="([^"]+)"', root_tag)
    for prefix, uri in pairs:
        ET.register_namespace(prefix, uri)
    return pairs

def qn(tag):
    return f"{WNS}{tag}"

def para_text(p):
    return "".join(t.text or "" for t in p.iter(qn("t")))

def para_style(p):
    pPr = p.find(qn("pPr"))
    if pPr is None:
        return None
    st = pPr.find(qn("pStyle"))
    return st.get(qn("val")) if st is not None else None

def first_run_rpr(p):
    r = p.find(qn("r"))
    if r is None:
        return None
    rPr = r.find(qn("rPr"))
    return copy.deepcopy(rPr) if rPr is not None else None

BODY_TEMPLATE_RPR = {"val": None}  # populated after first real body paragraph is found

def set_paragraph_text(p, text, rpr_source_p=None, fallback_rpr=None):
    src = rpr_source_p if rpr_source_p is not None else p
    rpr = first_run_rpr(src)
    if rpr is None:
        rpr = fallback_rpr
    for r in list(p.findall(qn("r"))):
        p.remove(r)
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if i > 0:
            br_run = ET.SubElement(p, qn("r"))
            if rpr is not None:
                br_run.append(copy.deepcopy(rpr))
            ET.SubElement(br_run, qn("br"))
        run = ET.SubElement(p, qn("r"))
        if rpr is not None:
            run.append(copy.deepcopy(rpr))
        t = ET.SubElement(run, qn("t"))
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = line

def clone_paragraph_with_text(template_p, text, fallback_rpr=None):
    p = copy.deepcopy(template_p)
    for r in list(p.findall(qn("r"))):
        p.remove(r)
    set_paragraph_text(p, text, rpr_source_p=template_p, fallback_rpr=fallback_rpr)
    return p

def prepend_text_to_first_run(p, prefix):
    r = p.find(qn("r"))
    t = r.find(qn("t")) if r is not None else None
    if t is None:
        # no run at all - just set the paragraph text
        set_paragraph_text(p, prefix)
        return
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = prefix + (t.text or "")

def append_text_to_last_run(p, suffix):
    runs = p.findall(qn("r"))
    if not runs:
        set_paragraph_text(p, suffix)
        return
    r = runs[-1]
    t = r.find(qn("t"))
    if t is None:
        t = ET.SubElement(r, qn("t"))
    t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = (t.text or "") + suffix

def set_cell_text(tc, text, fallback_rpr=None):
    p = tc.find(qn("p"))
    if p is None:
        return
    for extra in tc.findall(qn("p"))[1:]:
        tc.remove(extra)
    set_paragraph_text(p, text, fallback_rpr=fallback_rpr)


def main():
    z = zipfile.ZipFile(SRC)
    raw_xml = z.read("word/document.xml")
    ns_pairs = register_source_namespaces(raw_xml.decode("utf-8"))
    print(f"registered {len(ns_pairs)} source namespaces")
    root = ET.fromstring(raw_xml)
    body = root.find(qn("body"))

    def find_para(style=None, text_exact=None, text_contains=None):
        for c in body.findall(qn("p")):
            if style is not None and para_style(c) != style:
                continue
            t = para_text(c)
            if text_exact is not None and t != text_exact:
                continue
            if text_contains is not None and text_contains not in t:
                continue
            return c
        raise ValueError(f"paragraph not found: style={style} exact={text_exact!r} contains={text_contains!r}")

    def find_tbl_by_first_row_first_cell(text_exact):
        for tbl in body.findall(qn("tbl")):
            tr = tbl.find(qn("tr"))
            if tr is None:
                continue
            tc = tr.find(qn("tc"))
            if tc is None:
                continue
            p = tc.find(qn("p"))
            if p is not None and para_text(p) == text_exact:
                return tbl
        raise ValueError(f"table not found by first cell: {text_exact!r}")

    def is_heading_style(style):
        return style in ("Heading1", "Heading2", "Heading3")

    def replace_section_body(heading_style, heading_text, tag, fallback_rpr):
        """Delete every paragraph/table between this heading and the next
        heading (any level) or the next table or end of body, replacing with
        one paragraph containing {tag}. Returns the rPr used, so callers can
        reuse it as a fallback for headings with no body text to draw
        formatting from."""
        heading = find_para(style=heading_style, text_exact=heading_text)
        children = list(body)
        start = children.index(heading) + 1
        end = start
        while end < len(children):
            c = children[end]
            if c.tag == qn("tbl"):
                break
            if c.tag == qn("p") and is_heading_style(para_style(c)):
                break
            end += 1
        to_remove = children[start:end]
        template_p = None
        for c in to_remove:
            if c.tag == qn("p") and para_text(c).strip():
                template_p = c
                break
        for c in to_remove:
            body.remove(c)
        if template_p is not None:
            new_p = clone_paragraph_with_text(template_p, "{" + tag + "}", fallback_rpr=fallback_rpr)
            rpr = first_run_rpr(template_p)
        else:
            # no guidance text existed under this heading (e.g. Solution
            # Overview/Components) - fabricate a plain paragraph
            new_p = copy.deepcopy(heading)
            for r in list(new_p.findall(qn("r"))):
                new_p.remove(r)
            pPr = new_p.find(qn("pPr"))
            if pPr is not None:
                new_p.remove(pPr)  # drop heading style -> becomes Normal
            set_paragraph_text(new_p, "{" + tag + "}", fallback_rpr=fallback_rpr)
            rpr = fallback_rpr
        heading_idx = list(body).index(heading)
        body.insert(heading_idx + 1, new_p)
        return rpr

    def delete_section_intro(heading_style, heading_text):
        """Delete pure-guidance paragraphs sitting directly between a
        heading and its first real subsection/table, with no replacement."""
        heading = find_para(style=heading_style, text_exact=heading_text)
        children = list(body)
        start = children.index(heading) + 1
        end = start
        while end < len(children):
            c = children[end]
            if c.tag == qn("tbl"):
                break
            if c.tag == qn("p") and is_heading_style(para_style(c)):
                break
            end += 1
        for c in children[start:end]:
            body.remove(c)

    def delete_paragraph(text_exact):
        p = find_para(text_exact=text_exact)
        body.remove(p)

    def wrap_table_conditional(tbl, tag, fallback_rpr):
        """Insert {#tag} paragraph immediately before tbl and {/tag}
        immediately after it (docxtemplater's table-level loop/if
        technique: tags live in plain paragraphs surrounding the table)."""
        idx = list(body).index(tbl)
        open_p = ET.Element(qn("p"))
        set_paragraph_text(open_p, "{#" + tag + "}", fallback_rpr=fallback_rpr)
        close_p = ET.Element(qn("p"))
        set_paragraph_text(close_p, "{/" + tag + "}", fallback_rpr=fallback_rpr)
        body.insert(idx, open_p)
        body.insert(idx + 2, close_p)

    def make_loop_row(row, open_tag, close_tag, cell_tags, fallback_rpr):
        """Set each cell in `row` to its corresponding {tag} text, then
        prepend {#open_tag} to the first cell and append {/close_tag} to
        the last cell - docxtemplater's row-repeat convention."""
        cells = row.findall(qn("tc"))
        for cell, tag_text in zip(cells, cell_tags):
            set_cell_text(cell, "{" + tag_text + "}", fallback_rpr)
        first_p = cells[0].find(qn("p"))
        last_p = cells[-1].find(qn("p"))
        prepend_text_to_first_run(first_p, "{#" + open_tag + "}")
        append_text_to_last_run(last_p, "{/" + close_tag + "}")

    # Capture a reliable "normal body text" run-formatting template from the
    # very first guidance paragraph in the doc, to use as a fallback for
    # sections that have no existing body paragraph of their own.
    bg_heading = find_para(style="Heading2", text_exact="Background and Context")
    children = list(body)
    idx = children.index(bg_heading) + 1
    fallback_rpr = None
    while children[idx].tag == qn("p"):
        if para_text(children[idx]).strip():
            fallback_rpr = first_run_rpr(children[idx])
            break
        idx += 1
    print("fallback rpr captured:", fallback_rpr is not None)

    # ---- Cover title / subtitle ----
    title_p = find_para(style="Title", text_exact="TITLE TEXT HERE")
    set_paragraph_text(title_p, "{documentInfo.proposalTitle}")

    subtitle_p = find_para(style="Subtitle", text_exact="Client name | Proposal reference")
    set_paragraph_text(subtitle_p, "{documentInfo.clientName} | {documentInfo.proposalReference}")

    # ---- Document Information table ----
    doc_info_tbl = find_tbl_by_first_row_first_cell("Client name")
    rows = doc_info_tbl.findall(qn("tr"))
    set_cell_text(rows[0].findall(qn("tc"))[1], "{documentInfo.clientName}", fallback_rpr)
    set_cell_text(rows[1].findall(qn("tc"))[1], "{documentInfo.projectName}", fallback_rpr)
    set_cell_text(rows[2].findall(qn("tc"))[1], "{documentInfo.documentAuthor}", fallback_rpr)

    # ---- Contact Information table ----
    contact_tbl = find_tbl_by_first_row_first_cell(
        "This document has been supplied by Roc Technologies Limited, whose registered office is:"
    )
    crows = contact_tbl.findall(qn("tr"))
    set_cell_text(
        crows[1].findall(qn("tc"))[1],
        "{documentInfo.contactName}, {documentInfo.contactPhone}\n{documentInfo.contactEmail}",
        fallback_rpr,
    )

    # ---- Executive Summary ----
    replace_section_body("Heading2", "Background and Context", "executiveSummary.backgroundAndContext", fallback_rpr)
    replace_section_body("Heading2", "Next Steps", "executiveSummary.nextSteps", fallback_rpr)

    # ---- Current Environment and Requirements ----
    delete_section_intro("Heading1", "Current Environment and Requirements")
    replace_section_body("Heading2", "Current Environment Overview", "currentEnvironment.overview", fallback_rpr)
    replace_section_body("Heading2", "Current Services Overview", "currentEnvironment.currentServicesOverview", fallback_rpr)
    replace_section_body("Heading2", "Requirements Summary", "currentEnvironment.requirementsSummary", fallback_rpr)

    # ---- Solution Summary ----
    delete_section_intro("Heading1", "Solution Summary")
    replace_section_body("Heading2", "Solution Overview", "solutionSummary.overview", fallback_rpr)
    replace_section_body("Heading2", "Solution Components", "solutionSummary.components", fallback_rpr)

    # ---- Roc Services: Engagement Approach (also drops the conditional
    # Microsoft Partner guidance paragraph that lived in this range) ----
    delete_section_intro("Heading1", "Roc Services")
    replace_section_body("Heading2", "Engagement Approach", "rocServices.engagementApproach", fallback_rpr)

    # ---- Roc Services: Project Management ----
    # Keep the fixed intro paragraph and the 10 fixed PM task bullets as-is;
    # only remove the two meta-instruction paragraphs about milestone-vs-T&M.
    delete_paragraph(
        "We should specify whether the work is Milestone or T&M based, not both. "
        "There may be an exception whereby some elements are Milestone based and "
        "some elements are T&M, but this should be by exception only."
    )
    delete_paragraph("If T&M based work, please remove the Milestones table.")

    milestones_tbl = find_tbl_by_first_row_first_cell("Project Milestones and Associated Invoicing")
    mrows = milestones_tbl.findall(qn("tr"))
    # row0 = title row, row1 = header row (both kept fixed); row2 = first
    # example -> becomes the loop template; rows3-5 = extra examples, delete.
    make_loop_row(
        mrows[2], "rocServices.milestones", "rocServices.milestones",
        ["name", "completionDate", "percentCharge"], fallback_rpr,
    )
    for extra in mrows[3:]:
        milestones_tbl.remove(extra)
    wrap_table_conditional(milestones_tbl, "rocServices.milestoneBased", fallback_rpr)

    # ---- Roc Services: Service Transition ----
    replace_section_body("Heading2", "Service Transition", "rocServices.serviceTransition", fallback_rpr)

    # ---- Roc Services: Assumptions and Customer Dependencies ----
    # Drop the meta-instruction lines, keep the fixed example bullets, then
    # append a looping bullet for any transcript-specific assumptions.
    delete_paragraph(
        "What are the key assumptions made, further information needed, "
        "constraints and dependencies on the customer and third parties."
    )
    delete_paragraph(
        "Also use this section for key risks and to give the customer an idea of "
        "the effort they will need to expend (and the resource we’ll need "
        "involved from their side) to deliver this work successfully."
    )
    delete_paragraph("Examples below:")
    last_assumption = find_para(
        text_exact="Any events occurring that may impact the objectives and/or "
        "timescales of the implementation will be reported to Roc immediately."
    )
    # docxtemplater's paragraphLoop only repeats separate paragraphs
    # correctly when the open/close tags are each in their OWN paragraph
    # with the repeatable content paragraph(s) between them - cramming
    # {#loop}{.}{/loop} into a single paragraph just does an inline text
    # loop instead (all items concatenated with no paragraph break).
    open_bullet = ET.Element(qn("p"))
    set_paragraph_text(open_bullet, "{#rocServices.customerAssumptions}", fallback_rpr=fallback_rpr)
    content_bullet = clone_paragraph_with_text(last_assumption, "{.}", fallback_rpr=fallback_rpr)
    close_bullet = ET.Element(qn("p"))
    set_paragraph_text(close_bullet, "{/rocServices.customerAssumptions}", fallback_rpr=fallback_rpr)
    insert_at = list(body).index(last_assumption) + 1
    body.insert(insert_at, open_bullet)
    body.insert(insert_at + 1, content_bullet)
    body.insert(insert_at + 2, close_bullet)

    # ---- Service Overview (whole section optional) ----
    delete_section_intro("Heading1", "Service Overview")
    replace_section_body("Heading2", "Service Quality", "serviceOverview.serviceQuality", fallback_rpr)
    replace_section_body("Heading2", "ITIL Services", "serviceOverview.itilServices", fallback_rpr)
    replace_section_body("Heading2", "Technology Management", "serviceOverview.technologyManagement", fallback_rpr)
    so_heading = find_para(style="Heading1", text_exact="Service Overview")
    tm_content = find_para(text_exact="{serviceOverview.technologyManagement}")
    so_open = ET.Element(qn("p"))
    set_paragraph_text(so_open, "{#serviceOverview.include}", fallback_rpr=fallback_rpr)
    so_close = ET.Element(qn("p"))
    set_paragraph_text(so_close, "{/serviceOverview.include}", fallback_rpr=fallback_rpr)
    body.insert(list(body).index(so_heading), so_open)
    body.insert(list(body).index(tm_content) + 1, so_close)

    # ---- Commercial Summary ----
    delete_section_intro("Heading1", "Commercial Summary")
    # (quoteReference paragraph inserted the same way the narrative sections
    # are - it stops automatically at the first pricing table.)
    replace_section_body("Heading1", "Commercial Summary", "commercialSummary.quoteReference", fallback_rpr)
    # correct the label so it reads sensibly rather than a bare tag
    qref_p = find_para(text_exact="{commercialSummary.quoteReference}")
    set_paragraph_text(qref_p, "Quotation reference: {commercialSummary.quoteReference}", fallback_rpr=fallback_rpr)

    services_tbl = find_tbl_by_first_row_first_cell("Professional services")
    srows = services_tbl.findall(qn("tr"))
    make_loop_row(
        srows[1], "commercialSummary.serviceLineItems", "commercialSummary.serviceLineItems",
        ["label", "rate", "quantity", "total"], fallback_rpr,
    )
    # rows2-3 are extra examples; row4 is the TOTAL SERVICES row (kept, but
    # its total cell becomes the app-computed total rather than "£XXX")
    total_row = srows[4]
    set_cell_text(total_row.findall(qn("tc"))[3], "{commercialSummary.computedServicesTotal}", fallback_rpr)
    for extra in srows[2:4]:
        services_tbl.remove(extra)

    # Second parallel "Milestone 1/2/3" pricing table + the "OR" paragraph
    # between the two tables are redundant now that serviceLineItems covers
    # both the T&M and milestone cases via one table shape - remove both.
    delete_paragraph("OR")
    milestone_pricing_tbl = None
    for tbl in body.findall(qn("tbl")):
        tr = tbl.find(qn("tr"))
        tc = tr.find(qn("tc")) if tr is not None else None
        p = tc.find(qn("p")) if tc is not None else None
        if p is not None and para_text(p) == "Professional services":
            # the FIRST such table is already handled above (services_tbl);
            # skip it and remove any subsequent duplicate.
            if tbl is services_tbl:
                continue
            milestone_pricing_tbl = tbl
            break
    if milestone_pricing_tbl is not None:
        body.remove(milestone_pricing_tbl)

    uplift_tbl = find_tbl_by_first_row_first_cell("Managed service uplift")
    urows = uplift_tbl.findall(qn("tr"))
    set_cell_text(urows[1].findall(qn("tc"))[0], "{commercialSummary.managedServiceUplift.description}", fallback_rpr)
    set_cell_text(urows[1].findall(qn("tc"))[1], "{commercialSummary.managedServiceUplift.total}", fallback_rpr)
    wrap_table_conditional(uplift_tbl, "commercialSummary.hasManagedServiceUplift", fallback_rpr)

    azure_tbl = find_tbl_by_first_row_first_cell("Azure cost estimate:")
    arows = azure_tbl.findall(qn("tr"))
    make_loop_row(
        arows[1], "commercialSummary.azureCostEstimate", "commercialSummary.azureCostEstimate",
        ["description", "each", "quantity", "monthly", "annual"], fallback_rpr,
    )
    for extra in arows[2:]:
        azure_tbl.remove(extra)
    wrap_table_conditional(azure_tbl, "commercialSummary.hasAzureCosts", fallback_rpr)

    ongoing_tbl = find_tbl_by_first_row_first_cell("Ongoing annual costs:")
    orows = ongoing_tbl.findall(qn("tr"))
    make_loop_row(
        orows[1], "commercialSummary.ongoingAnnualCosts", "commercialSummary.ongoingAnnualCosts",
        ["description", "each", "quantity", "annual"], fallback_rpr,
    )
    for extra in orows[2:]:
        ongoing_tbl.remove(extra)
    wrap_table_conditional(ongoing_tbl, "commercialSummary.hasOngoingAnnualCosts", fallback_rpr)

    # ---- Terms & Conditions: milestone-vs-T&M bullet choice ----
    milestone_bullet = find_para(
        text_exact="The proposal will be milestone based against fixed outcomes, "
        "to be defined in a subsequent, signed Statement of Work."
    )
    tm_bullet = find_para(
        text_exact="The proposal is based on time and materials resource "
        "delivered by a suitably skilled person or team."
    )
    prepend_text_to_first_run(milestone_bullet, "{#rocServices.milestoneBased}")
    append_text_to_last_run(milestone_bullet, "{/rocServices.milestoneBased}")
    prepend_text_to_first_run(tm_bullet, "{^rocServices.milestoneBased}")
    append_text_to_last_run(tm_bullet, "{/rocServices.milestoneBased}")
    delete_paragraph("OR")

    print("All edits applied. Re-serializing for a sanity check...")
    tree_bytes = ET.tostring(root, encoding="unicode")
    print("length:", len(tree_bytes))
    root2 = ET.fromstring(tree_bytes)
    print("round-trip parse OK, body children now:", len(list(root2.find(qn('body')))))

    # ---- Write out the modified docx (dotx -> docx: fix the one
    # template-specific content-type declaration so Word opens generated
    # output as a normal document, not "new document from template") ----
    with zipfile.ZipFile(SRC) as zin:
        names = zin.namelist()
        contents = {n: zin.read(n) for n in names}
    doc_xml = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    # ET emits <?xml version='1.0' encoding='utf-8'?> - swap for the
    # conventional OOXML form (cosmetic only, but matches what Word itself
    # writes and avoids relying on lenient-parser behaviour elsewhere).
    doc_xml = doc_xml.replace(
        b"<?xml version='1.0' encoding='utf-8'?>",
        b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    )
    contents["word/document.xml"] = doc_xml
    ct = contents["[Content_Types].xml"].decode("utf-8")
    ct = ct.replace(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    )
    contents["[Content_Types].xml"] = ct.encode("utf-8")
    with zipfile.ZipFile(OUT_DOCX, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in names:
            zout.writestr(n, contents[n])
    print("Wrote", OUT_DOCX)

if __name__ == "__main__":
    main()

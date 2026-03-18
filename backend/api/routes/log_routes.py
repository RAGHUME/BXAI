from flask import Blueprint, request, jsonify, Response, send_file
from bson import ObjectId
import datetime
from io import BytesIO
from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

log_bp = Blueprint('log_bp', __name__)

def _get_log_collection():
    from flask import current_app
    return current_app.config["MONGO_COLLECTIONS"]["system_logs"]

def generate_professional_pdf(title, log_data, is_list=False):
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=LETTER)
    styles = getSampleStyleSheet()
    
    # Custom Styles
    styles.add(ParagraphStyle(name='SectionHeader', parent=styles['Heading2'], fontSize=12, spaceAfter=6, textColor=colors.HexColor('#1f2937')))
    styles.add(ParagraphStyle(name='LogText', parent=styles['Code'], fontSize=8, backColor=colors.whitesmoke, borderColor=colors.grey, borderWidth=1, leftIndent=10, rightIndent=10, spaceBefore=5, spaceAfter=5, padding=5))
    
    elements = []
    
    # -- Title Section --
    elements.append(Paragraph(f"<b>{title}</b>", styles['Title']))
    elements.append(Paragraph(f"Generated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}", styles['Normal']))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.grey, spaceBefore=10, spaceAfter=20))

    if is_list:
        # --- FULL REPORT TABLE ---
        elements.append(Paragraph("Executive Summary", styles['SectionHeader']))
        elements.append(Paragraph("The following table summarizes system activity processed by the X-LAD engine. Anomalies are highlighted based on semantic vector distance scores.", styles['Normal']))
        elements.append(Spacer(1, 15))

        table_data = [["Timestamp", "Status", "Score", "Activity Content"]]
        
        for log in log_data:
            ts = log.get('timestamp', 'N/A')
            if isinstance(ts, datetime.datetime): ts = ts.strftime('%Y-%m-%d %H:%M')
            status = log.get('status', 'N/A')
            score = f"{log.get('distance', 0):.4f}"
            msg = (log.get('message') or '')[:50]
            
            table_data.append([ts, status, score, msg])
        
        # Table Styling
        t = Table(table_data, colWidths=[90, 60, 50, 340])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e5e7eb')), # Header Grey
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
        ]))
        
        # Color rows based on status
        for i, row in enumerate(table_data[1:], start=1):
            if row[1] == "Anomaly":
                t.setStyle(TableStyle([('TEXTCOLOR', (1, i), (1, i), colors.red)]))
            else:
                t.setStyle(TableStyle([('TEXTCOLOR', (1, i), (1, i), colors.green)]))

        elements.append(t)

    else:
        # --- SINGLE LOG DETAILED REPORT ---
        
        # Section 1: Alert Overview
        elements.append(Paragraph("1. Alert Overview", styles['SectionHeader']))
        data_overview = [
            ["Analysis ID:", log_data.get('Log ID')],
            ["Detection Status:", log_data.get('Status')],
            ["Anomaly Score:", log_data.get('Distance Score')],
            ["Timestamp:", datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')]
        ]
        t_overview = Table(data_overview, colWidths=[120, 350])
        t_overview.setStyle(TableStyle([
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (1,1), (1,1), colors.red if log_data.get('Status') == 'Anomaly' else colors.green),
        ]))
        elements.append(t_overview)
        elements.append(Spacer(1, 15))

        # Section 2: Technical Evidence
        elements.append(Paragraph("2. Technical Evidence", styles['SectionHeader']))
        elements.append(Paragraph("Raw Log Entry:", styles['Heading4']))
        elements.append(Paragraph(log_data.get('Raw Log Content', 'N/A'), styles['LogText']))
        elements.append(Spacer(1, 10))
        
        # Section 3: AI Analysis
        elements.append(Paragraph("3. X-LAD AI Analysis", styles['SectionHeader']))
        elements.append(Paragraph("<b>Insight:</b>", styles['Normal']))
        elements.append(Paragraph(log_data.get('AI Insight', 'N/A'), styles['Normal']))
        elements.append(Spacer(1, 10))
        
        if log_data.get('Status') == 'Anomaly':
             elements.append(Paragraph("<b>Risk Factors (LIME Features):</b>", styles['Normal']))
             elements.append(Paragraph(log_data.get('LIME Analysis', 'N/A'), styles['Normal']))

    doc.build(elements)
    buffer.seek(0)
    return buffer

@log_bp.route('/ingest', methods=['POST'])
def ingest_log():
    data = request.get_json()
    logs = data.get("logs", [])
    collection = _get_log_collection()
    if logs:
        documents = [{"message": log, "timestamp": datetime.datetime.utcnow()} for log in logs]
        collection.insert_many(documents)
    return jsonify({"message": f"Ingested {len(documents)} logs"}), 201

@log_bp.route('/alerts', methods=['GET'])
def get_alerts():
    collection = _get_log_collection()
    # Sort by _id desc to show newest first
    cursor = collection.find({}).sort("_id", -1).limit(50)
    
    results = []
    for log in cursor:
        ts = log.get("timestampStart") or log.get("timestamp") or log.get("createdAt")
        msg = log.get("message")
        if not msg:
             msg = log.get("actionType") or log.get("description") or "System Event"

        results.append({
            "_id": str(log.get("_id")),
            "anomaly_status": log.get("anomaly_status", "Processing"),
            "distance": log.get("distance", 0),
            "message": msg,
            "ai_explanation": log.get("ai_explanation"),
            "timestamp": ts,
            "user": log.get("userId")
        })
        
    return jsonify(results)

@log_bp.route('/report/<log_id>', methods=['GET'])
def get_report(log_id):
    collection = _get_log_collection()
    log = collection.find_one({"_id": ObjectId(log_id)})
    if not log: return jsonify({"error": "Not found"}), 404
    
    # Prepare data for PDF
    lime_str = str(log.get('lime_explanation', 'N/A'))
    
    content = {
        "Log ID": str(log_id),
        "Status": log.get('anomaly_status', 'Processing'),
        "Distance Score": f"{log.get('distance', 0):.4f}",
        "Raw Log Content": log.get('message') or log.get('description'),
        "AI Insight": log.get('ai_explanation', 'Pending analysis...'),
        "LIME Analysis": lime_str
    }
    
    pdf_buffer = generate_professional_pdf(f"X-LAD Forensics Report", content)
    return send_file(pdf_buffer, mimetype="application/pdf", as_attachment=True, download_name=f"report_{log_id}.pdf")

@log_bp.route('/report/full', methods=['GET'])
def get_complete_report():
    collection = _get_log_collection()
    cursor = collection.find({}).sort("_id", -1).limit(100)
    
    logs = []
    for log in cursor:
        ts = log.get("timestamp") or log.get("timestampStart")
        msg = log.get("message") or log.get("actionType") or "System Event"
        logs.append({
            "timestamp": ts,
            "status": log.get("anomaly_status", "Pending"),
            "distance": log.get("distance", 0),
            "message": msg
        })
        
    pdf_buffer = generate_professional_pdf("Full System Log Analysis", logs, is_list=True)
    return send_file(pdf_buffer, mimetype="application/pdf", as_attachment=True, download_name="full_report.pdf")
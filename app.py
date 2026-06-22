import os
import json
import re
import hashlib
import hmac
import base64
import urllib.request
from datetime import datetime, date, timedelta
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash, abort
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'shift-board-secret-key-2026')
basedir = os.path.abspath(os.path.dirname(__file__))

# Vercelでは/tmpに保存、ローカルではshift.db
db_path = os.environ.get('DATABASE_URL', '')
if not db_path:
    import tempfile
    if os.path.exists('/tmp'):
        db_path = 'sqlite:///' + os.path.join('/tmp', 'shift.db')
    else:
        db_path = f'sqlite:///{os.path.join(basedir, "shift.db")}'

app.config['SQLALCHEMY_DATABASE_URI'] = db_path
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# LINE Bot設定（LINE Developer Consoleから取得）
LINE_CHANNEL_ACCESS_TOKEN = os.environ.get('LINE_CHANNEL_ACCESS_TOKEN', '')
LINE_CHANNEL_SECRET = os.environ.get('LINE_CHANNEL_SECRET', '')

db = SQLAlchemy(app)


# ==================== Models ====================

class Employee(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    password_hash = db.Column(db.String(200), nullable=True)
    role = db.Column(db.String(20), nullable=False, default='parttime')  # manager, fulltime, parttime
    hourly_wage = db.Column(db.Integer, default=1000)
    is_highschool = db.Column(db.Boolean, default=False)
    max_weekly_hours = db.Column(db.Integer, default=28)
    max_daily_hours = db.Column(db.Integer, default=8)
    max_end_time = db.Column(db.String(5), default='22:00')
    line_user_id = db.Column(db.String(100), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        if not self.password_hash:
            return True
        return check_password_hash(self.password_hash, password)


class ShiftPeriod(db.Model):
    """シフト期間（半月ごと）"""
    id = db.Column(db.Integer, primary_key=True)
    year = db.Column(db.Integer, nullable=False)
    month = db.Column(db.Integer, nullable=False)
    half = db.Column(db.Integer, nullable=False)  # 1=前半(1-15), 2=後半(16-末日)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    is_published = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.now)


class Shift(db.Model):
    """個々人のシフト"""
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    period_id = db.Column(db.Integer, db.ForeignKey('shift_period.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.String(5))  # HH:MM
    end_time = db.Column(db.String(5))    # HH:MM
    break_minutes = db.Column(db.Integer, default=60)
    shift_type = db.Column(db.String(10), default='L')  # L=ランチ, D=ディナー, F=フル, B=裏麺
    area = db.Column(db.String(20))  # フロア, レジ, 調理, 裏麺
    status = db.Column(db.String(10), default='pending')  # pending, confirmed, absent
    note = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    employee = db.relationship('Employee', backref='shifts')
    period = db.relationship('ShiftPeriod', backref='shifts')


class Availability(db.Model):
    """アルバイトの出勤可能日"""
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=False)
    period_id = db.Column(db.Integer, db.ForeignKey('shift_period.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    is_available = db.Column(db.Boolean, default=True)
    preferred_start = db.Column(db.String(5))
    preferred_end = db.Column(db.String(5))
    note = db.Column(db.String(200))
    source = db.Column(db.String(20), default='manual')  # manual, line
    created_at = db.Column(db.DateTime, default=datetime.now)

    employee = db.relationship('Employee', backref='availabilities')
    period = db.relationship('ShiftPeriod', backref='availabilities')


class SalesData(db.Model):
    """売上データ"""
    id = db.Column(db.Integer, primary_key=True)
    period_id = db.Column(db.Integer, db.ForeignKey('shift_period.id'), nullable=False)
    date = db.Column(db.Date, nullable=False)
    sales_forecast = db.Column(db.Integer, default=0)  # 売上予測
    actual_sales = db.Column(db.Integer, default=0)     # 実績
    last_year_sales = db.Column(db.Integer, default=0)  # 前年売上
    last_year_lunch = db.Column(db.Integer, default=0)  # 前年ランチ売上
    last_year_dinner = db.Column(db.Integer, default=0) # 前年ディナー売上
    lunch_sales = db.Column(db.Integer, default=0)      # 今期ランチ売上
    dinner_sales = db.Column(db.Integer, default=0)     # 今期ディナー売上
    created_at = db.Column(db.DateTime, default=datetime.now)

    period = db.relationship('ShiftPeriod', backref='sales_data')


class LineMessage(db.Model):
    """LINEから取得したメッセージ"""
    id = db.Column(db.Integer, primary_key=True)
    employee_id = db.Column(db.Integer, db.ForeignKey('employee.id'), nullable=True)
    raw_message = db.Column(db.Text, nullable=False)
    parsed_dates = db.Column(db.Text)  # JSON形式で日付情報を保存
    parsed_status = db.Column(db.String(20))  # available, unavailable, partial
    is_processed = db.Column(db.Boolean, default=False)
    received_at = db.Column(db.DateTime, default=datetime.now)
    created_at = db.Column(db.DateTime, default=datetime.now)

    employee = db.relationship('Employee', backref='line_messages')


# ==================== Helper Functions ====================

def get_period_dates(period):
    """期間の日付リストを取得"""
    dates = []
    current = period.start_date
    while current <= period.end_date:
        dates.append(current)
        current += timedelta(days=1)
    return dates


def get_day_name(date_obj):
    """曜日を取得"""
    days = ['月', '火', '水', '木', '金', '土', '日']
    return days[date_obj.weekday()]


def calculate_labor_stats(period_id):
    """労働統計を計算"""
    shifts = Shift.query.filter_by(period_id=period_id, status='confirmed').all()
    employees = Employee.query.filter_by(is_active=True).all()

    total_hours = 0
    total_break = 0
    ap_hours = 0
    employee_hours = {}

    for shift in shifts:
        if shift.start_time and shift.end_time:
            start = datetime.strptime(shift.start_time, '%H:%M')
            end = datetime.strptime(shift.end_time, '%H:%M')
            work_minutes = (end - start).seconds // 60 - (shift.break_minutes or 0)
            work_hours = work_minutes / 60

            total_hours += work_hours
            total_break += (shift.break_minutes or 0) / 60

            emp = Employee.query.get(shift.employee_id)
            if emp:
                if emp.id not in employee_hours:
                    employee_hours[emp.id] = {'name': emp.name, 'hours': 0, 'is_ap': emp.role == 'parttime'}
                employee_hours[emp.id]['hours'] += work_hours

                if emp.role == 'parttime':
                    ap_hours += work_hours

    return {
        'total_hours': round(total_hours, 1),
        'total_break': round(total_break, 1),
        'ap_hours': round(ap_hours, 1),
        'employee_hours': employee_hours
    }


def calculate_sales_stats(period_id):
    """売上統計を計算"""
    stats = SalesData.query.filter_by(period_id=period_id).with_entities(
        db.func.sum(SalesData.sales_forecast),
        db.func.sum(SalesData.actual_sales),
        db.func.sum(SalesData.last_year_sales),
        db.func.sum(SalesData.last_year_lunch),
        db.func.sum(SalesData.last_year_dinner),
        db.func.sum(SalesData.lunch_sales),
        db.func.sum(SalesData.dinner_sales)
    ).first()

    total_forecast = stats[0] or 0
    total_actual = stats[1] or 0
    total_last_year = stats[2] or 0
    total_last_year_lunch = stats[3] or 0
    total_last_year_dinner = stats[4] or 0
    total_lunch = stats[5] or 0
    total_dinner = stats[6] or 0

    # 人時売上
    labor = calculate_labor_stats(period_id)
    people_hour_sales = 0
    if labor['total_hours'] > 0:
        sales_amount = total_actual if total_actual > 0 else total_forecast
        people_hour_sales = round(sales_amount / labor['total_hours'], 0)

    # 前年比
    yoy_ratio = 0
    if total_last_year > 0:
        sales_amount = total_actual if total_actual > 0 else total_forecast
        yoy_ratio = round((sales_amount / total_last_year) * 100, 1)

    # 平均時給
    ap_avg_wage = 0
    ap_employees = Employee.query.filter_by(role='parttime', is_active=True).all()
    if ap_employees:
        ap_avg_wage = round(sum(e.hourly_wage for e in ap_employees) / len(ap_employees))

    # 変動費（人件費）
    labor_cost = 0
    for emp_id, data in labor['employee_hours'].items():
        emp = Employee.query.get(emp_id)
        if emp:
            labor_cost += round(data['hours'] * emp.hourly_wage)

    shifts = Shift.query.filter_by(period_id=period_id, status='confirmed').all()

    return {
        'total_forecast': total_forecast,
        'total_actual': total_actual,
        'total_last_year': total_last_year,
        'total_last_year_lunch': total_last_year_lunch,
        'total_last_year_dinner': total_last_year_dinner,
        'total_lunch': total_lunch,
        'total_dinner': total_dinner,
        'yoy_ratio': yoy_ratio,
        'people_hour_sales': people_hour_sales,
        'ap_avg_wage': ap_avg_wage,
        'labor_cost': labor_cost,
        'lunch_staff_count': len([s for s in shifts if s.shift_type == 'L']) // max(1, len(set(s.date for s in shifts))),
        'dinner_staff_count': len([s for s in shifts if s.shift_type == 'D']) // max(1, len(set(s.date for s in shifts)))
    }


# ==================== Routes ====================

@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    user = Employee.query.get(session['user_id'])
    if user.role == 'manager':
        return redirect(url_for('manager_dashboard'))
    else:
        return redirect(url_for('staff_view'))


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        name = request.form.get('name')
        password = request.form.get('password', '')
        employee = Employee.query.filter_by(name=name, is_active=True).first()
        if employee and employee.check_password(password):
            session['user_id'] = employee.id
            session['user_role'] = employee.role
            session['user_name'] = employee.name
            if employee.role == 'manager':
                return redirect(url_for('manager_dashboard'))
            else:
                return redirect(url_for('staff_view'))
        flash('ユーザー名またはパスワードが間違っています')
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ==================== Manager Routes ====================

@app.route('/manager')
def manager_dashboard():
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    periods = ShiftPeriod.query.order_by(ShiftPeriod.year.desc(), ShiftPeriod.month.desc(), ShiftPeriod.half.desc()).all()
    current_period = periods[0] if periods else None

    return render_template('manager_dashboard.html',
                         periods=periods,
                         current_period=current_period,
                         today=date.today())


@app.route('/manager/period/create', methods=['POST'])
def create_period():
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    year = int(request.form['year'])
    month = int(request.form['month'])
    half = int(request.form['half'])

    if half == 1:
        start = date(year, month, 1)
        end = date(year, month, 15)
    else:
        if month == 12:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, month + 1, 1) - timedelta(days=1)
        start = date(year, month, 16)

    period = ShiftPeriod(year=year, month=month, half=half,
                        start_date=start, end_date=end)
    db.session.add(period)
    db.session.commit()

    return redirect(url_for('shift_editor', period_id=period.id))


@app.route('/manager/shift/<int:period_id>')
def shift_editor(period_id):
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    period = ShiftPeriod.query.get_or_404(period_id)
    dates = get_period_dates(period)
    employees = Employee.query.filter_by(is_active=True).order_by(Employee.role, Employee.name).all()

    # 各従業員のシフトを取得
    shifts_data = {}
    for emp in employees:
        shifts_data[emp.id] = {}
        for d in dates:
            shift = Shift.query.filter_by(employee_id=emp.id, period_id=period_id, date=d).first()
            avail = Availability.query.filter_by(employee_id=emp.id, period_id=period_id, date=d).first()
            shifts_data[emp.id][d] = {
                'shift': shift,
                'availability': avail
            }

    stats = calculate_sales_stats(period_id)

    return render_template('shift_editor.html',
                         period=period,
                         dates=dates,
                         employees=employees,
                         shifts_data=shifts_data,
                         stats=stats,
                         today=date.today(),
                         get_day_name=get_day_name)


@app.route('/manager/shift/update', methods=['POST'])
def update_shift():
    if session.get('user_role') != 'manager':
        return jsonify({'error': 'unauthorized'}), 401

    data = request.json
    employee_id = data['employee_id']
    period_id = data['period_id']
    date_str = data['date']
    shift_date = datetime.strptime(date_str, '%Y-%m-%d').date()

    shift = Shift.query.filter_by(
        employee_id=employee_id,
        period_id=period_id,
        date=shift_date
    ).first()

    if data.get('start_time') and data.get('end_time'):
        if not shift:
            shift = Shift(employee_id=employee_id, period_id=period_id, date=shift_date)
            db.session.add(shift)
        shift.start_time = data['start_time']
        shift.end_time = data['end_time']
        shift.shift_type = data.get('shift_type', 'L')
        shift.area = data.get('area', '')
        shift.break_minutes = data.get('break_minutes', 60)
        shift.status = 'confirmed'
    else:
        if shift:
            db.session.delete(shift)

    db.session.commit()
    return jsonify({'success': True})


@app.route('/manager/shift/delete', methods=['POST'])
def delete_shift():
    if session.get('user_role') != 'manager':
        return jsonify({'error': 'unauthorized'}), 401

    data = request.json
    shift = Shift.query.filter_by(
        employee_id=data['employee_id'],
        period_id=data['period_id'],
        date=datetime.strptime(data['date'], '%Y-%m-%d').date()
    ).first()

    if shift:
        db.session.delete(shift)
        db.session.commit()

    return jsonify({'success': True})


@app.route('/manager/employees')
def manage_employees():
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    employees = Employee.query.filter_by(is_active=True).order_by(Employee.role, Employee.name).all()
    return render_template('employees.html', employees=employees)


@app.route('/manager/employee/add', methods=['POST'])
def add_employee():
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    emp = Employee(
        name=request.form['name'],
        role=request.form.get('role', 'parttime'),
        hourly_wage=int(request.form.get('hourly_wage', 1000)),
        is_highschool='is_highschool' in request.form,
        max_weekly_hours=int(request.form.get('max_weekly_hours', 28)),
        max_daily_hours=int(request.form.get('max_daily_hours', 8)),
        max_end_time=request.form.get('max_end_time', '22:00')
    )
    password = request.form.get('password', '')
    if password:
        emp.set_password(password)
    db.session.add(emp)
    db.session.commit()
    flash(f'{emp.name}を追加しました')
    return redirect(url_for('manage_employees'))


@app.route('/manager/employee/update', methods=['POST'])
def update_employee():
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    emp = Employee.query.get_or_404(int(request.form['id']))
    emp.name = request.form['name']
    emp.role = request.form.get('role', 'parttime')
    emp.hourly_wage = int(request.form.get('hourly_wage', 1000))
    emp.is_highschool = 'is_highschool' in request.form
    emp.max_weekly_hours = int(request.form.get('max_weekly_hours', 28))
    emp.max_daily_hours = int(request.form.get('max_daily_hours', 8))
    emp.max_end_time = request.form.get('max_end_time', '22:00')
    password = request.form.get('password', '')
    if password:
        emp.set_password(password)
    db.session.commit()
    flash(f'{emp.name}の情報を更新しました')
    return redirect(url_for('manage_employees'))


@app.route('/manager/employee/delete', methods=['POST'])
def delete_employee():
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    emp = Employee.query.get_or_404(int(request.form['id']))
    emp.is_active = False
    db.session.commit()
    flash(f'{emp.name}を無効にしました')
    return redirect(url_for('manage_employees'))


@app.route('/manager/sales/<int:period_id>')
def sales_editor(period_id):
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    period = ShiftPeriod.query.get_or_404(period_id)
    dates = get_period_dates(period)

    sales_data = {}
    for d in dates:
        sale = SalesData.query.filter_by(period_id=period_id, date=d).first()
        sales_data[d] = sale

    stats = calculate_sales_stats(period_id)
    labor = calculate_labor_stats(period_id)

    return render_template('sales_editor.html',
                         period=period,
                         dates=dates,
                         sales_data=sales_data,
                         stats=stats,
                         labor=labor,
                         get_day_name=get_day_name)


@app.route('/manager/sales/update', methods=['POST'])
def update_sales():
    if session.get('user_role') != 'manager':
        return jsonify({'error': 'unauthorized'}), 401

    data = request.json
    date_str = data['date']
    sale_date = datetime.strptime(date_str, '%Y-%m-%d').date()

    sale = SalesData.query.filter_by(
        period_id=data['period_id'],
        date=sale_date
    ).first()

    if not sale:
        sale = SalesData(period_id=data['period_id'], date=sale_date)
        db.session.add(sale)

    sale.sales_forecast = int(data.get('sales_forecast', 0))
    sale.actual_sales = int(data.get('actual_sales', 0))
    sale.last_year_sales = int(data.get('last_year_sales', 0))
    sale.last_year_lunch = int(data.get('last_year_lunch', 0))
    sale.last_year_dinner = int(data.get('last_year_dinner', 0))
    sale.lunch_sales = int(data.get('lunch_sales', 0))
    sale.dinner_sales = int(data.get('dinner_sales', 0))

    db.session.commit()
    return jsonify({'success': True})


@app.route('/manager/report/<int:period_id>')
def report_view(period_id):
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    period = ShiftPeriod.query.get_or_404(period_id)
    dates = get_period_dates(period)
    employees = Employee.query.filter_by(is_active=True).order_by(Employee.role, Employee.name).all()

    shifts_data = {}
    for emp in employees:
        shifts_data[emp.id] = {}
        for d in dates:
            shift = Shift.query.filter_by(employee_id=emp.id, period_id=period_id, date=d).first()
            shifts_data[emp.id][d] = shift

    # 売上データ
    sales_data = {}
    for d in dates:
        sale = SalesData.query.filter_by(period_id=period_id, date=d).first()
        sales_data[d] = sale

    stats = calculate_sales_stats(period_id)
    labor_raw = calculate_labor_stats(period_id)

    # 日別統計
    daily_stats = {}
    for d in dates:
        day_shifts = Shift.query.filter_by(period_id=period_id, date=d, status='confirmed').all()
        fulltime_hours = 0
        fulltime_break = 0
        ap_hours = 0
        lunch_count = 0
        dinner_count = 0
        labor_cost = 0

        for s in day_shifts:
            if s.start_time and s.end_time:
                start = datetime.strptime(s.start_time, '%H:%M')
                end = datetime.strptime(s.end_time, '%H:%M')
                work_minutes = (end - start).seconds // 60 - (s.break_minutes or 0)
                work_hours = work_minutes / 60

                emp = Employee.query.get(s.employee_id)
                if emp:
                    if emp.role in ('manager', 'fulltime'):
                        fulltime_hours += work_hours
                        fulltime_break += (s.break_minutes or 0) / 60
                    else:
                        ap_hours += work_hours
                    labor_cost += round(work_hours * emp.hourly_wage)

                if s.shift_type == 'L':
                    lunch_count += 1
                elif s.shift_type == 'D':
                    dinner_count += 1

        # 人時売上
        sale = sales_data.get(d)
        people_hour_sales = 0
        total_day_hours = fulltime_hours + ap_hours
        if total_day_hours > 0 and sale:
            sales_amount = sale.actual_sales if sale.actual_sales > 0 else sale.sales_forecast
            people_hour_sales = round(sales_amount / total_day_hours, 0) if sales_amount else 0

        daily_stats[d.isoformat()] = {
            'fulltime_hours': round(fulltime_hours, 1),
            'fulltime_break': round(fulltime_break, 1),
            'fulltime_no_break': round(fulltime_hours, 1),
            'ap_hours': round(ap_hours, 1),
            'labor_cost': labor_cost,
            'lunch_count': lunch_count,
            'dinner_count': dinner_count,
            'people_hour_sales': people_hour_sales
        }

    # 従業員別合計
    emp_totals = {}
    for emp in employees:
        total = 0
        for d in dates:
            shift = shifts_data[emp.id][d]
            if shift and shift.start_time and shift.end_time:
                start = datetime.strptime(shift.start_time, '%H:%M')
                end = datetime.strptime(shift.end_time, '%H:%M')
                work_minutes = (end - start).seconds // 60 - (shift.break_minutes or 0)
                total += work_minutes / 60
        emp_totals[emp.id] = round(total, 1)

    # 週別集計
    weekly_data = {}
    for w_num, (w_start, w_end) in enumerate([(0,6), (7,13), (14,20), (21,27)], 1):
        w_sales = 0
        w_hours = 0
        for i, d in enumerate(dates):
            if w_start <= i <= w_end:
                sale = sales_data.get(d)
                if sale:
                    w_sales += sale.sales_forecast if sale.sales_forecast else 0
                for emp in employees:
                    shift = shifts_data[emp.id][d]
                    if shift and shift.start_time and shift.end_time:
                        start = datetime.strptime(shift.start_time, '%H:%M')
                        end = datetime.strptime(shift.end_time, '%H:%M')
                        work_minutes = (end - start).seconds // 60 - (shift.break_minutes or 0)
                        w_hours += work_minutes / 60
        w_phs = round(w_sales / w_hours, 0) if w_hours > 0 else 0
        weekly_data[f'w{w_num}'] = {'sales': w_sales, 'hours': round(w_hours, 1), 'phs': w_phs}

    # 労働統計の拡張
    fulltime_hours = sum(v['fulltime_hours'] for v in daily_stats.values())
    fulltime_break = sum(v['fulltime_break'] for v in daily_stats.values())
    ap_hours_total = sum(v['ap_hours'] for v in daily_stats.values())
    total_labor_cost = sum(v['labor_cost'] for v in daily_stats.values())

    labor = {
        'fulltime_hours': round(fulltime_hours, 1),
        'fulltime_break': round(fulltime_break, 1),
        'fulltime_no_break': round(fulltime_hours, 1),
        'total_ap_hours': round(ap_hours_total, 1),
        'total_labor_cost': total_labor_cost,
        'total_hours': labor_raw['total_hours'],
        'total_break': labor_raw['total_break']
    }

    return render_template('report.html',
                         period=period,
                         dates=dates,
                         employees=employees,
                         shifts_data=shifts_data,
                         sales_data=sales_data,
                         stats=stats,
                         labor=labor,
                         daily_stats=daily_stats,
                         emp_totals=emp_totals,
                         weekly_data=weekly_data,
                         get_day_name=get_day_name)


@app.route('/manager/line-monitor')
def line_monitor():
    if session.get('user_role') != 'manager':
        return redirect(url_for('login'))

    messages = LineMessage.query.order_by(LineMessage.received_at.desc()).limit(50).all()
    employees = Employee.query.filter_by(is_active=True, role='parttime').all()

    return render_template('line_monitor.html',
                         messages=messages,
                         employees=employees)


@app.route('/manager/line/process', methods=['POST'])
def process_line_message():
    if session.get('user_role') != 'manager':
        return jsonify({'error': 'unauthorized'}), 401

    data = request.json
    msg_id = data['message_id']
    employee_id = data.get('employee_id')

    msg = LineMessage.query.get(msg_id)
    if msg and employee_id:
        msg.employee_id = employee_id
        msg.is_processed = True
        db.session.commit()

    return jsonify({'success': True})


# ==================== Staff Routes ====================

@app.route('/staff')
def staff_view():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    user = Employee.query.get(session['user_id'])
    periods = ShiftPeriod.query.order_by(ShiftPeriod.year.desc(), ShiftPeriod.month.desc(), ShiftPeriod.half.desc()).all()

    return render_template('staff_view.html',
                         user=user,
                         periods=periods)


@app.route('/staff/availability/<int:period_id>')
def availability_input(period_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))

    user = Employee.query.get(session['user_id'])
    period = ShiftPeriod.query.get_or_404(period_id)
    dates = get_period_dates(period)

    availabilities = {}
    for d in dates:
        avail = Availability.query.filter_by(
            employee_id=user.id,
            period_id=period_id,
            date=d
        ).first()
        availabilities[d] = avail

    shifts = {}
    for d in dates:
        shift = Shift.query.filter_by(
            employee_id=user.id,
            period_id=period_id,
            date=d
        ).first()
        shifts[d] = shift

    return render_template('availability_input.html',
                         user=user,
                         period=period,
                         dates=dates,
                         availabilities=availabilities,
                         shifts=shifts,
                         get_day_name=get_day_name)


@app.route('/staff/availability/update', methods=['POST'])
def update_availability():
    if 'user_id' not in session:
        return jsonify({'error': 'unauthorized'}), 401

    data = request.json
    user_id = session['user_id']
    date_str = data['date']
    avail_date = datetime.strptime(date_str, '%Y-%m-%d').date()

    avail = Availability.query.filter_by(
        employee_id=user_id,
        period_id=data['period_id'],
        date=avail_date
    ).first()

    if not avail:
        avail = Availability(employee_id=user_id, period_id=data['period_id'], date=avail_date)
        db.session.add(avail)

    avail.is_available = data.get('is_available', False)
    avail.preferred_start = data.get('preferred_start')
    avail.preferred_end = data.get('preferred_end')
    avail.note = data.get('note', '')

    db.session.commit()
    return jsonify({'success': True})


@app.route('/staff/schedule/<int:period_id>')
def staff_schedule(period_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))

    user = Employee.query.get(session['user_id'])
    period = ShiftPeriod.query.get_or_404(period_id)
    dates = get_period_dates(period)

    my_shifts = {}
    for d in dates:
        shift = Shift.query.filter_by(
            employee_id=user.id,
            period_id=period_id,
            date=d
        ).first()
        my_shifts[d] = shift

    return render_template('staff_schedule.html',
                         user=user,
                         period=period,
                         dates=dates,
                         my_shifts=my_shifts,
                         get_day_name=get_day_name)


# ==================== API ====================

@app.route('/api/shifts/<int:period_id>')
def get_shifts_api(period_id):
    """シフトデータをJSONで取得"""
    shifts = Shift.query.filter_by(period_id=period_id).all()
    result = []
    for s in shifts:
        emp = Employee.query.get(s.employee_id)
        result.append({
            'id': s.id,
            'employee_id': s.employee_id,
            'employee_name': emp.name if emp else '',
            'date': s.date.isoformat(),
            'start_time': s.start_time,
            'end_time': s.end_time,
            'shift_type': s.shift_type,
            'area': s.area,
            'break_minutes': s.break_minutes,
            'status': s.status
        })
    return jsonify(result)


@app.route('/api/availability/<int:period_id>')
def get_availability_api(period_id):
    """出勤可能日データをJSONで取得"""
    avails = Availability.query.filter_by(period_id=period_id).all()
    result = []
    for a in avails:
        emp = Employee.query.get(a.employee_id)
        result.append({
            'id': a.id,
            'employee_id': a.employee_id,
            'employee_name': emp.name if emp else '',
            'date': a.date.isoformat(),
            'is_available': a.is_available,
            'preferred_start': a.preferred_start,
            'preferred_end': a.preferred_end,
            'note': a.note,
            'source': a.source
        })
    return jsonify(result)


@app.route('/api/stats/<int:period_id>')
def get_stats_api(period_id):
    """統計データをJSONで取得"""
    stats = calculate_sales_stats(period_id)
    labor = calculate_labor_stats(period_id)
    return jsonify({**stats, **labor})


# ==================== LINE Webhook ====================

def parse_availability_message(text, sender_name):
    """
    LINEメッセージから出勤可能日を解析
    
    対応パターン:
    - 「1日 10-15」「1日 10:00-15:00」→ 日付と時間
    - 「1日○」「1日×」→ 日付と出勤可否
    - 「1 10 15」→ 日付 開始 終了
    - 「1-5 10-15」→ 期間指定
    """
    results = []
    
    # パターン1: 「1日 10-15」や「1日 10:00-15:00」
    pattern1 = re.findall(r'(\d{1,2})日?\s*(\d{1,2})[:：]?\d{0,2}\s*[-〜~]\s*(\d{1,2})[:：]?\d{0,2}', text)
    if pattern1:
        for day, start, end in pattern1:
            results.append({
                'day': int(day),
                'start': f'{int(start):02d}:00',
                'end': f'{int(end):02d}:00',
                'available': True
            })
        return results
    
    # パターン2: 「1日○」「1日×」
    pattern2 = re.findall(r'(\d{1,2})日?\s*([○◯◎✓√]|×|✖✕X)', text)
    if pattern2:
        for day, symbol in pattern2:
            available = symbol in ['○', '◯', '◎', '✓', '√']
            results.append({
                'day': int(day),
                'available': available
            })
        return results
    
    # パターン3: 「1 10 15」（日付 開始 終了）
    pattern3 = re.findall(r'(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})', text)
    if pattern3:
        for day, start, end in pattern3:
            if 1 <= int(day) <= 31 and 0 <= int(start) <= 23 and 0 <= int(end) <= 23:
                results.append({
                    'day': int(day),
                    'start': f'{int(start):02d}:00',
                    'end': f'{int(end):02d}:00',
                    'available': True
                })
        return results
    
    # パターン4: 「1-5 10-15」（期間指定）
    pattern4 = re.findall(r'(\d{1,2})\s*[-〜~]\s*(\d{1,2})\s+(\d{1,2})\s*[-〜~]\s*(\d{1,2})', text)
    if pattern4:
        for start_day, end_day, start_time, end_time in pattern4:
            for day in range(int(start_day), int(end_day) + 1):
                results.append({
                    'day': day,
                    'start': f'{int(start_time):02d}:00',
                    'end': f'{int(end_time):02d}:00',
                    'available': True
                })
        return results
    
    # パターン5: 日付だけ（「1日 2日 3日」など）
    pattern5 = re.findall(r'(\d{1,2})日?', text)
    if pattern5 and not results:
        for day in set(pattern5):
            day_num = int(day)
            if 1 <= day_num <= 31:
                # デフォルトで出勤可能
                results.append({
                    'day': day_num,
                    'available': True
                })
    
    return results


def get_current_period():
    """現在のシフト期間を取得"""
    today = date.today()
    period = ShiftPeriod.query.filter(
        ShiftPeriod.start_date <= today,
        ShiftPeriod.end_date >= today
    ).first()
    if not period:
        period = ShiftPeriod.query.order_by(ShiftPeriod.year.desc(), ShiftPeriod.month.desc(), ShiftPeriod.half.desc()).first()
    return period


@app.route('/webhook', methods=['POST'])
def webhook():
    """LINE Webhookエンドポイント"""
    if not LINE_CHANNEL_SECRET:
        return jsonify({'error': 'LINE not configured'}), 503
    
    signature = request.headers.get('X-Line-Signature', '')
    body = request.get_data(as_text=True)
    
    if not verify_line_signature(body, signature):
        abort(400)
    
    data = json.loads(body)
    
    for event in data.get('events', []):
        event_type = event.get('type')
        
        if event_type == 'message' and event.get('message', {}).get('type') == 'text':
            handle_line_message(event)
        elif event_type == 'follow':
            handle_line_follow(event)
        elif event_type == 'join':
            handle_line_join(event)
    
    return 'OK'


def handle_line_follow(event):
    """フォローされた時の処理"""
    user_id = event['source']['userId']
    reply_token = event['replyToken']
    profile = get_line_profile(user_id)
    display_name = profile.get('displayName', user_id)
    
    reply = f'{display_name}さん、こんにちは！\n'
    reply += '松戸店シフト管理Botです。\n'
    reply += '出勤可能日をメッセージで送ってください。\n'
    reply += '例：「1日 10-15」「1日○ 2日×」'
    
    reply_to_line(reply_token, reply)


def handle_line_join(event):
    """グループに参加した時の処理"""
    reply_token = event.get('replyToken')
    if reply_token:
        reply = '松戸店シフト管理Botです！\n'
        reply += '出勤可能日をメッセージで送ってください。\n'
        reply += '例：「1日 10-15」「1日○ 2日×」'
        reply_to_line(reply_token, reply)


def handle_line_message(event):
    """LINEメッセージ受信時の処理"""
    user_id = event['source']['userId']
    message_text = event['message']['text']
    reply_token = event['replyToken']
    
    # ユーザープロフィールを取得
    profile = get_line_profile(user_id)
    display_name = profile.get('displayName', user_id)
    
    # データベースにメッセージを保存
    msg = LineMessage(
        raw_message=message_text,
        received_at=datetime.now()
    )
    db.session.add(msg)
    db.session.commit()
    
    # 出勤可能日を解析
    parsed = parse_availability_message(message_text, display_name)
    
    if parsed:
        period = get_current_period()
        if period:
            # ユーザーに対応する従業員を検索
            employee = Employee.query.filter_by(line_user_id=user_id, is_active=True).first()
            
            if not employee:
                employee = Employee.query.filter_by(name=display_name, is_active=True).first()
                if employee:
                    employee.line_user_id = user_id
                    db.session.commit()
            
            if employee:
                saved_count = 0
                for p in parsed:
                    day = p['day']
                    try:
                        avail_date = date(period.year, period.month, day)
                        
                        avail = Availability.query.filter_by(
                            employee_id=employee.id,
                            period_id=period.id,
                            date=avail_date
                        ).first()
                        
                        if not avail:
                            avail = Availability(
                                employee_id=employee.id,
                                period_id=period.id,
                                date=avail_date
                            )
                            db.session.add(avail)
                        
                        avail.is_available = p.get('available', True)
                        avail.preferred_start = p.get('start')
                        avail.preferred_end = p.get('end')
                        avail.source = 'line'
                        saved_count += 1
                    except (ValueError, KeyError):
                        continue
                
                db.session.commit()
                
                reply = f'{display_name}さん、承知しました！\n'
                reply += f'{period.month}月の出勤可能日を{saved_count}日分登録しました。\n'
                reply += '内容を確認します。'
            else:
                reply = f'{display_name}さん、メッセージありがとうございます。\n'
                reply += '※アカウントが紐付いていないため、手動で確認します。'
        else:
            reply = '現在、シフト期間が設定されていません。'
    else:
        reply = 'メッセージを解析できませんでした。\n'
        reply += '例：「1日 10-15」「1日○」'
    
    reply_to_line(reply_token, reply)


@app.route('/manager/line/link', methods=['POST'])
def link_line_account():
    """LINEアカウントと従業員を紐付ける"""
    if session.get('user_role') != 'manager':
        return jsonify({'error': 'unauthorized'}), 401
    
    data = request.json
    employee_id = data.get('employee_id')
    line_user_id = data.get('line_user_id')
    
    emp = Employee.query.get(employee_id)
    if emp:
        emp.line_user_id = line_user_id
        db.session.commit()
        return jsonify({'success': True})
    
    return jsonify({'error': 'not found'}), 404


# ==================== Init DB ====================

def init_db():
    """データベースを初期化し、サンプルデータを作成"""
    with app.app_context():
        db.create_all()

        if Employee.query.count() == 0:
            # サンプル従業員データ
            employees = [
                Employee(name='店長', role='manager', hourly_wage=1500, is_highschool=False),
                Employee(name='森', role='fulltime', hourly_wage=1300, is_highschool=False),
                Employee(name='西村(優)', role='fulltime', hourly_wage=1300, is_highschool=False),
                Employee(name='西村(海)', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='玉置', role='fulltime', hourly_wage=1300, is_highschool=False),
                Employee(name='河原', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='杉田', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='熊澤', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='渡辺', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='安部', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='北川', role='parttime', hourly_wage=1100, is_highschool=True, max_end_time='22:00'),
                Employee(name='本橋', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='早川', role='parttime', hourly_wage=1100, is_highschool=True, max_end_time='22:00'),
                Employee(name='工藤', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='小林', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='関口', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='山田', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='水本', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='藤野', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='浅海', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='玉川', role='parttime', hourly_wage=1100, is_highschool=False),
                Employee(name='小林(芽)', role='parttime', hourly_wage=1100, is_highschool=True, max_end_time='22:00'),
            ]
            # 店長はデフォルトパスワードを設定
            employees[0].set_password('manager123')
            for emp in employees[1:]:
                emp.set_password('pass1234')
            db.session.add_all(employees)
            db.session.commit()
            print("サンプル従業員データを作成しました")


if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)

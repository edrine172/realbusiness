from collections import defaultdict
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import F, Sum
from django.utils import timezone

from .models import Expense, Product, Purchase, Sale, StockMovement


CENT = Decimal('0.01')


def _sale_period(start, end, include_breakdown=False):
    sales = Sale.objects.prefetch_related('items__product__category').filter(
        created_at__date__gte=start,
        created_at__date__lte=end,
    )
    movements = StockMovement.objects.select_related('product', 'product__category').filter(
        created_at__date__gte=start,
        created_at__date__lte=end,
        movement_type=StockMovement.MovementType.OUTBOUND,
    )
    sale_receipts = set()
    revenue_by_date = defaultdict(Decimal)
    cost_by_date = defaultdict(Decimal)
    category_rows = {}
    product_rows = {}
    revenue = Decimal('0')
    cost = Decimal('0')

    for sale in sales:
        sale_date = timezone.localtime(sale.created_at).date()
        sale_receipts.add(sale.receipt_number)
        sale_revenue = sale.subtotal - sale.discount_amount
        sale_cost = sum((item.quantity * item.unit_cost for item in sale.items.all()), Decimal('0'))
        revenue += sale_revenue
        cost += sale_cost
        revenue_by_date[sale_date] += sale_revenue
        cost_by_date[sale_date] += sale_cost
        if include_breakdown:
            for item in sale.items.all():
                gross_line = item.quantity * item.unit_price
                allocated_discount = (gross_line * sale.discount_amount / sale.subtotal).quantize(CENT, rounding=ROUND_HALF_UP) if sale.subtotal else Decimal('0')
                line_revenue = gross_line - allocated_discount
                _add_breakdown(category_rows, product_rows, item.product, item.quantity, line_revenue, item.quantity * item.unit_cost)

    for movement in movements.exclude(reference__in=sale_receipts):
        product = movement.product
        movement_revenue = abs(movement.quantity) * product.unit_price
        movement_cost = abs(movement.quantity) * product.cost_price
        sale_date = timezone.localtime(movement.created_at).date()
        revenue += movement_revenue
        cost += movement_cost
        revenue_by_date[sale_date] += movement_revenue
        cost_by_date[sale_date] += movement_cost
        if include_breakdown:
            _add_breakdown(category_rows, product_rows, product, abs(movement.quantity), movement_revenue, movement_cost)

    return {
        'revenue': revenue,
        'cost': cost,
        'revenue_by_date': revenue_by_date,
        'cost_by_date': cost_by_date,
        'categories': category_rows,
        'products': product_rows,
    }


def _add_breakdown(category_rows, product_rows, product, units, revenue, cost):
    category_name = product.category.name
    category = category_rows.setdefault(category_name, {'name': category_name, 'units': 0, 'revenue': Decimal('0')})
    category['units'] += units
    category['revenue'] += revenue
    row = product_rows.setdefault(product.id, {
        'product_name': product.name,
        'product_sku': product.sku,
        'category_name': category_name,
        'units_sold': 0,
        'revenue': Decimal('0'),
        'cost': Decimal('0'),
    })
    row['units_sold'] += units
    row['revenue'] += revenue
    row['cost'] += cost


def _distribution(rows, total):
    result = []
    for row in rows.values():
        result.append({
            'name': row['name'],
            'units': row['units'],
            'revenue': str(row['revenue'].quantize(CENT)),
            'percent': round(float(row['revenue'] / total * 100), 1) if total else 0,
        })
    return sorted(result, key=lambda row: Decimal(row['revenue']), reverse=True)


def build_report_summary(days, period_start=None, period_end=None):
    today = timezone.localdate()
    start = period_start or today - timedelta(days=days - 1)
    report_end = period_end or today
    days = (report_end - start).days + 1
    previous_end = start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=days - 1)
    current = _sale_period(start, report_end, include_breakdown=True)
    previous = _sale_period(previous_start, previous_end)

    received_purchases = Purchase.objects.filter(
        status=Purchase.Status.RECEIVED,
        received_at__date__gte=start,
        received_at__date__lte=report_end,
    ).select_related('supplier').prefetch_related('items__product__category')
    purchase_references = set()
    purchase_by_date = defaultdict(Decimal)
    purchase_category_rows = {}
    purchase_spend = Decimal('0')
    for purchase in received_purchases:
        purchase_references.add(purchase.reference)
        purchase_date = timezone.localtime(purchase.received_at).date()
        for item in purchase.items.all():
            amount = item.quantity * item.unit_cost
            purchase_spend += amount
            purchase_by_date[purchase_date] += amount
            category_name = item.product.category.name
            row = purchase_category_rows.setdefault(category_name, {'name': category_name, 'units': 0, 'revenue': Decimal('0')})
            row['units'] += item.quantity
            row['revenue'] += amount

    legacy_inbound = StockMovement.objects.select_related('product', 'product__category').filter(
        created_at__date__gte=start,
        created_at__date__lte=report_end,
        movement_type=StockMovement.MovementType.INBOUND,
    ).exclude(reference__in=purchase_references)
    for movement in legacy_inbound:
        amount = abs(movement.quantity) * movement.product.cost_price
        purchase_spend += amount
        purchase_date = timezone.localtime(movement.created_at).date()
        purchase_by_date[purchase_date] += amount
        category_name = movement.product.category.name
        row = purchase_category_rows.setdefault(category_name, {'name': category_name, 'units': 0, 'revenue': Decimal('0')})
        row['units'] += abs(movement.quantity)
        row['revenue'] += amount

    products = list(Product.objects.select_related('category').all())
    inventory_value = sum((product.quantity * product.cost_price for product in products), Decimal('0'))
    inventory_units = sum(product.quantity for product in products)
    inventory_category_rows = {}
    for product in products:
        amount = product.quantity * product.cost_price
        row = inventory_category_rows.setdefault(product.category.name, {'name': product.category.name, 'units': 0, 'revenue': Decimal('0')})
        row['units'] += product.quantity
        row['revenue'] += amount
    low_stock_count = sum(1 for product in products if 0 < product.quantity <= product.reorder_level)
    out_of_stock_count = sum(1 for product in products if product.quantity == 0)

    operating_expenses = Expense.objects.filter(
        expense_date__gte=start,
        expense_date__lte=report_end,
        status__in=[Expense.Status.APPROVED, Expense.Status.PAID],
    )
    expense_total = operating_expenses.aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
    expense_by_date = {
        row['expense_date']: row['total']
        for row in operating_expenses.values('expense_date').annotate(total=Sum('total_amount'))
    }

    gross_profit = current['revenue'] - current['cost']
    net_profit = gross_profit - expense_total
    gross_margin = float(gross_profit / current['revenue'] * 100) if current['revenue'] else 0
    turnover = float(current['cost'] / inventory_value * Decimal('365') / Decimal(days)) if inventory_value else 0
    revenue_change = float((current['revenue'] - previous['revenue']) / previous['revenue'] * 100) if previous['revenue'] else 0
    top_products = []
    for row in current['products'].values():
        product_profit = row['revenue'] - row['cost']
        top_products.append({
            **row,
            'revenue': str(row['revenue'].quantize(CENT)),
            'cost': str(row['cost'].quantize(CENT)),
            'gross_profit': str(product_profit.quantize(CENT)),
            'gross_margin': round(float(product_profit / row['revenue'] * 100), 1) if row['revenue'] else 0,
            'average_price': str((row['revenue'] / row['units_sold']).quantize(CENT)) if row['units_sold'] else '0.00',
        })
    top_products.sort(key=lambda row: Decimal(row['revenue']), reverse=True)

    series_interval = 'day' if days <= 365 else 'month' if days <= 3650 else 'year'
    daily_series = {}
    for offset in range(days):
        date = start + timedelta(days=offset)
        if series_interval == 'day':
            key = date.isoformat()
            label = f'{date.strftime("%b")} {date.day}'
        elif series_interval == 'month':
            key = date.strftime('%Y-%m')
            label = date.strftime('%b %Y')
        else:
            key = str(date.year)
            label = str(date.year)
        daily_revenue = current['revenue_by_date'].get(date, Decimal('0'))
        daily_cost = current['cost_by_date'].get(date, Decimal('0'))
        bucket = daily_series.setdefault(key, {'label': label, 'revenue': 0, 'gross_profit': 0, 'purchases': 0, 'expenses': 0})
        bucket['revenue'] += float(daily_revenue)
        bucket['gross_profit'] += float(daily_revenue - daily_cost)
        bucket['purchases'] += float(purchase_by_date.get(date, Decimal('0')))
        bucket['expenses'] += float(expense_by_date.get(date, Decimal('0')))

    open_purchases = Purchase.objects.filter(status=Purchase.Status.ORDERED).prefetch_related('items')
    open_purchase_value = sum(
        (item.quantity * item.unit_cost for purchase in open_purchases for item in purchase.items.all()),
        Decimal('0'),
    )
    return {
        'range_days': days,
        'series_interval': series_interval,
        'start_date': start.isoformat(),
        'end_date': report_end.isoformat(),
        'revenue': str(current['revenue'].quantize(CENT)),
        'previous_revenue': str(previous['revenue'].quantize(CENT)),
        'revenue_change_percent': round(revenue_change, 1),
        'cost_of_goods': str(current['cost'].quantize(CENT)),
        'gross_profit': str(gross_profit.quantize(CENT)),
        'gross_margin': round(gross_margin, 1),
        'operating_expenses': str(expense_total.quantize(CENT)),
        'net_profit': str(net_profit.quantize(CENT)),
        'inventory_value': str(inventory_value.quantize(CENT)),
        'inventory_units': inventory_units,
        'total_skus': len(products),
        'low_stock_count': low_stock_count,
        'out_of_stock_count': out_of_stock_count,
        'inventory_turnover': round(turnover, 1),
        'purchase_spend': str(purchase_spend.quantize(CENT)),
        'received_orders': received_purchases.count(),
        'open_orders': open_purchases.count(),
        'open_purchase_value': str(open_purchase_value.quantize(CENT)),
        'daily_series': list(daily_series.values()),
        'categories': _distribution(current['categories'], current['revenue']),
        'inventory_categories': _distribution(inventory_category_rows, inventory_value),
        'purchase_categories': _distribution(purchase_category_rows, purchase_spend),
        'top_products': top_products[:10],
    }
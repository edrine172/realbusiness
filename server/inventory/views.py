from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
import json
from math import isfinite
import re
from urllib.error import URLError
from urllib.request import urlopen

from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework import viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from .models import Category, Customer, CustomerLedgerEntry, Expense, ExpenseBudget, Notification, PayrollLine, PayrollRun, Product, Purchase, PurchaseItem, Sale, SaleItem, SecurityAuditEvent, StaffAttendance, StaffMember, StockMovement, Supplier, SupplierLedgerEntry, SystemSetting
from .serializers import CategorySerializer, CustomerLedgerEntrySerializer, CustomerPaymentSerializer, CustomerSerializer, ExpenseBudgetSerializer, ExpenseSerializer, NotificationSerializer, PayrollRunSerializer, ProductSerializer, PurchaseSerializer, SaleCheckoutSerializer, SaleSerializer, StaffAttendanceInputSerializer, StaffAttendanceSerializer, StaffMemberSerializer, StockAdjustmentSerializer, StockMovementSerializer, SupplierLedgerEntrySerializer, SupplierPaymentSerializer, SupplierSerializer
from .date_ranges import day_range
from .reports import build_report_summary
from .permissions import RoleModelPermissions

DAILY_TARGET_UNITS = 15
DAILY_TARGET_MET_WAGE = Decimal('8000.00')
DAILY_TARGET_MISSED_WAGE = Decimal('7000.00')
SUNDAY_DAILY_WAGE = Decimal('5000.00')

SETTINGS_DEFAULTS = {
    'organization': {
        'business_name': 'Apex Supply Co.',
        'tax_id': '',
        'currency': 'UGX',
        'timezone': 'Africa/Kampala',
        'default_warehouse': 'Main Warehouse',
    },
    'operations': {
        'reorder_threshold': 15,
        'allow_negative_stock': True,
        'auto_purchase_drafts': True,
        'default_payment_terms': 'Net 30',
    },
    'security': {
        'require_two_factor': False,
        'session_timeout_minutes': 30,
        'audit_retention_days': 365,
    },
    'integrations': {
        'quickbooks_enabled': True,
        'stripe_enabled': True,
        'webhooks_enabled': True,
    },
}


@api_view(['GET', 'PATCH'])
@permission_classes([RoleModelPermissions])
def system_settings(request):
    settings = {category: values.copy() for category, values in SETTINGS_DEFAULTS.items()}
    for item in SystemSetting.objects.all():
        if item.category in settings and item.key in settings[item.category]:
            settings[item.category][item.key] = item.value

    if request.method == 'PATCH':
        updates = request.data.get('settings')
        if not isinstance(updates, dict) or not updates:
            raise ValidationError({'settings': 'Provide at least one category of settings to update.'})

        validated = []
        for category, values in updates.items():
            if category not in SETTINGS_DEFAULTS or not isinstance(values, dict) or not values:
                raise ValidationError({'settings': f'Unknown or empty settings category: {category}.'})
            for key, value in values.items():
                if key not in SETTINGS_DEFAULTS[category]:
                    raise ValidationError({'settings': f'Unknown setting: {category}.{key}.'})
                if category == 'organization' and key == 'currency' and (
                    not isinstance(value, str) or not re.fullmatch(r'[A-Z]{3}', value)
                ):
                    raise ValidationError({'settings': 'Currency must be a three-letter uppercase currency code.'})
                default = SETTINGS_DEFAULTS[category][key]
                if type(value) is not type(default):
                    raise ValidationError({'settings': f'{category}.{key} has an invalid value type.'})
                if isinstance(value, str) and len(value) > 120:
                    raise ValidationError({'settings': f'{category}.{key} must be 120 characters or fewer.'})
                if isinstance(value, int) and not isinstance(value, bool) and value < 1:
                    raise ValidationError({'settings': f'{category}.{key} must be greater than zero.'})
                validated.append((category, key, value))

        with transaction.atomic():
            for category, key, value in validated:
                previous = settings[category][key]
                if previous == value:
                    continue
                SystemSetting.objects.update_or_create(
                    key=key,
                    defaults={'category': category, 'value': value, 'updated_by': request.user if request.user.is_authenticated else None},
                )
                SecurityAuditEvent.objects.create(
                    actor=request.user if request.user.is_authenticated else None,
                    action='settings.updated',
                    target_type='settings',
                    target_id=f'{category}.{key}',
                    details={'previous': previous, 'value': value},
                )
                settings[category][key] = value

    audit_log = [
        {
            'id': event.id,
            'actor_name': event.actor.get_full_name() or event.actor.get_username() if event.actor else 'System',
            'action': event.action,
            'target_id': event.target_id,
            'details': event.details,
            'created_at': event.created_at,
        }
        for event in SecurityAuditEvent.objects.filter(target_type='settings').select_related('actor')[:20]
    ]
    return Response({'settings': settings, 'audit_log': audit_log})


@api_view(['GET'])
@permission_classes([AllowAny])
def exchange_rates(request):
    cached_rates = cache.get('ugx_exchange_rates')
    if cached_rates is None:
        try:
            with urlopen('https://open.er-api.com/v6/latest/UGX', timeout=5) as response:
                payload = json.load(response)
        except (URLError, TimeoutError, OSError, ValueError):
            return Response({'detail': 'Live UGX exchange rates are temporarily unavailable.'}, status=503)

        raw_rates = payload.get('rates') if isinstance(payload, dict) and payload.get('result') == 'success' and payload.get('base_code') == 'UGX' else None
        updated_at = payload.get('time_last_update_utc') if isinstance(payload, dict) else None
        if not isinstance(raw_rates, dict) or not isinstance(updated_at, str):
            return Response({'detail': 'The exchange-rate service returned an invalid response.'}, status=502)

        rates = {
            code: rate
            for code, rate in raw_rates.items()
            if isinstance(code, str)
            and re.fullmatch(r'[A-Z]{3}', code)
            and isinstance(rate, (int, float))
            and not isinstance(rate, bool)
            and isfinite(rate)
            and rate > 0
        }
        rates['UGX'] = 1
        cached_rates = {'rates': rates, 'updated_at': updated_at}
        cache.set('ugx_exchange_rates', cached_rates, timeout=3600)

    configured_currency = SystemSetting.objects.filter(category='organization', key='currency').values_list('value', flat=True).first() or 'UGX'
    return Response({
        'base_currency': 'UGX',
        'currency': configured_currency,
        'rates': cached_rates['rates'],
        'updated_at': cached_rates['updated_at'],
    })


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        if category.products.exists():
            raise ValidationError({'detail': 'This category is assigned to products. Move those products to another category before deleting it.'})
        return super().destroy(request, *args, **kwargs)


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.prefetch_related('purchases__items__product', 'ledger_entries').all()
    serializer_class = SupplierSerializer

    @action(detail=True, methods=['get'])
    def dashboard(self, request, pk=None):
        supplier = self.get_object()
        purchases = supplier.purchases.select_related('supplier').prefetch_related('items__product').all()
        open_purchases = [purchase for purchase in purchases if purchase.status == Purchase.Status.ORDERED]
        received_purchases = [purchase for purchase in purchases if purchase.status == Purchase.Status.RECEIVED]
        return Response({
            'supplier': SupplierSerializer(supplier).data,
            'lifetime_spend': SupplierSerializer(supplier).data['lifetime_spend'],
            'outstanding_balance': str(supplier.outstanding_balance),
            'purchase_orders': PurchaseSerializer(purchases[:50], many=True).data,
            'open_order_value': str(sum(
                (item.quantity * item.unit_cost for purchase in open_purchases for item in purchase.items.all()),
                Decimal('0'),
            ).quantize(Decimal('0.01'))),
            'received_orders': len(received_purchases),
            'ledger_entries': SupplierLedgerEntrySerializer(supplier.ledger_entries.select_related('purchase')[:30], many=True).data,
            'supplied_products': ProductSerializer(supplier.products.select_related('category').all(), many=True).data,
        })

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def payments(self, request, pk=None):
        serializer = SupplierPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        supplier = Supplier.objects.select_for_update().get(pk=pk)
        if data['amount'] > supplier.outstanding_balance:
            raise ValidationError({'amount': f'Payment cannot exceed the outstanding balance of {supplier.outstanding_balance}.'})
        supplier.outstanding_balance -= data['amount']
        supplier.save(update_fields=['outstanding_balance'])
        from uuid import uuid4
        entry = SupplierLedgerEntry.objects.create(
            supplier=supplier,
            entry_type=SupplierLedgerEntry.EntryType.PAYMENT,
            amount=data['amount'],
            reference=data.get('reference', '').strip() or f'PAY-{uuid4().hex[:8].upper()}',
            note=data.get('note', '').strip() or 'Supplier payment issued',
        )
        return Response({
            'supplier': SupplierSerializer(supplier).data,
            'ledger_entry': SupplierLedgerEntrySerializer(entry).data,
        }, status=201)


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'customer_code', 'contact_name', 'email', 'sector']
    ordering_fields = ['name', 'created_at', 'outstanding_balance']
    ordering = ['name']

    def _sale_payment_allocations(self, customer, sales):
        account_sales = [
            sale for sale in sales
            if sale.payment_method == Sale.PaymentMethod.ACCOUNT
            or any(entry.entry_type == CustomerLedgerEntry.EntryType.CHARGE for entry in sale.ledger_entries.all())
        ]
        paid_by_sale = {
            sale.id: sum(
                (entry.amount for entry in sale.ledger_entries.all()
                 if entry.entry_type == CustomerLedgerEntry.EntryType.PAYMENT),
                Decimal('0'),
            )
            for sale in account_sales
        }
        unallocated_payments = customer.ledger_entries.filter(
            entry_type=CustomerLedgerEntry.EntryType.PAYMENT,
            sale__isnull=True,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        for sale in sorted(account_sales, key=lambda row: (row.created_at, row.id)):
            remaining = max(sale.total - paid_by_sale[sale.id], Decimal('0'))
            allocation = min(unallocated_payments, remaining)
            paid_by_sale[sale.id] += allocation
            unallocated_payments -= allocation
            if unallocated_payments <= 0:
                break
        return paid_by_sale, unallocated_payments

    @action(detail=True, methods=['get'])
    def dashboard(self, request, pk=None):
        customer = self.get_object()
        sales = list(customer.sales.prefetch_related('items', 'ledger_entries').all())
        lifetime_revenue = sum((sale.total for sale in sales), Decimal('0'))
        paid_by_sale, _ = self._sale_payment_allocations(customer, sales)
        total_paid_amount = sum(
            (
                sale.total if sale.payment_method != Sale.PaymentMethod.ACCOUNT
                and not any(entry.entry_type == CustomerLedgerEntry.EntryType.CHARGE for entry in sale.ledger_entries.all())
                else paid_by_sale.get(sale.id, Decimal('0'))
                for sale in sales
            ),
            Decimal('0'),
        )
        total_remaining_balance = sum(
            (
                max(sale.total - paid_by_sale.get(sale.id, Decimal('0')), Decimal('0'))
                for sale in sales
                if sale.payment_method == Sale.PaymentMethod.ACCOUNT
                or any(entry.entry_type == CustomerLedgerEntry.EntryType.CHARGE for entry in sale.ledger_entries.all())
            ),
            Decimal('0'),
        )
        ledger_totals = customer.ledger_entries.values('entry_type').annotate(total=Sum('amount'))
        account_totals = {
            row['entry_type']: row['total'] or Decimal('0')
            for row in ledger_totals
        }
        return Response({
            'customer': CustomerSerializer(customer).data,
            'lifetime_revenue': str(lifetime_revenue.quantize(Decimal('0.01'))),
            'completed_orders': len(sales),
            'outstanding_balance': str(customer.outstanding_balance),
            'total_paid_amount': str(total_paid_amount.quantize(Decimal('0.01'))),
            'total_remaining_balance': str(total_remaining_balance.quantize(Decimal('0.01'))),
            'account_charges': str(account_totals.get(CustomerLedgerEntry.EntryType.CHARGE, Decimal('0')).quantize(Decimal('0.01'))),
            'account_payments': str(account_totals.get(CustomerLedgerEntry.EntryType.PAYMENT, Decimal('0')).quantize(Decimal('0.01'))),
            'account_credits': str(account_totals.get(CustomerLedgerEntry.EntryType.CREDIT, Decimal('0')).quantize(Decimal('0.01'))),
            'sales': SaleSerializer(
                sales[:50],
                many=True,
                context={'sale_paid_amounts': paid_by_sale},
            ).data,
            'ledger_entries': CustomerLedgerEntrySerializer(
                customer.ledger_entries.select_related('sale')[:20],
                many=True,
            ).data,
        })

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def payments(self, request, pk=None):
        serializer = CustomerPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        customer = Customer.objects.select_for_update().get(pk=pk)
        if data['amount'] > customer.outstanding_balance:
            raise ValidationError({'amount': f"Payment cannot exceed the outstanding balance of {customer.outstanding_balance}."})
        customer.outstanding_balance -= data['amount']
        customer.save(update_fields=['outstanding_balance'])
        from uuid import uuid4
        reference = data.get('reference', '').strip() or f"PAY-{uuid4().hex[:8].upper()}"
        note = data.get('note', '').strip() or 'Payment received'
        sales = list(
            Sale.objects.select_for_update()
            .filter(customer=customer)
            .prefetch_related('ledger_entries')
            .order_by('created_at', 'id')
        )
        sales = [
            sale for sale in sales
            if sale.payment_method == Sale.PaymentMethod.ACCOUNT
            or any(entry.entry_type == CustomerLedgerEntry.EntryType.CHARGE for entry in sale.ledger_entries.all())
        ]
        paid_by_sale, _ = self._sale_payment_allocations(customer, sales)
        payment_remaining = data['amount']
        new_entries = []
        target_sale = data.get('sale')
        if target_sale is not None:
            target_sale = next((sale for sale in sales if sale.pk == target_sale.pk), None)
            if target_sale is None:
                raise ValidationError({'sale': 'Select an on-account sale belonging to this customer.'})
            sale_balance = max(target_sale.total - paid_by_sale.get(target_sale.id, Decimal('0')), Decimal('0'))
            if payment_remaining > sale_balance:
                raise ValidationError({'amount': f'Payment cannot exceed this sale balance of {sale_balance:.2f}.'})
            new_entries.append(CustomerLedgerEntry.objects.create(
                customer=customer,
                sale=target_sale,
                entry_type=CustomerLedgerEntry.EntryType.PAYMENT,
                amount=payment_remaining,
                reference=reference,
                note=note,
            ))
            payment_remaining = Decimal('0')

        for sale in sales:
            if target_sale is not None:
                break
            sale_balance = max(sale.total - paid_by_sale.get(sale.id, Decimal('0')), Decimal('0'))
            amount_for_sale = min(payment_remaining, sale_balance)
            if amount_for_sale <= 0:
                continue
            new_entries.append(CustomerLedgerEntry.objects.create(
                customer=customer,
                sale=sale,
                entry_type=CustomerLedgerEntry.EntryType.PAYMENT,
                amount=amount_for_sale,
                reference=reference,
                note=note,
            ))
            payment_remaining -= amount_for_sale
            if payment_remaining <= 0:
                break
        if payment_remaining > 0 or not new_entries:
            new_entries.append(CustomerLedgerEntry.objects.create(
                customer=customer,
                entry_type=CustomerLedgerEntry.EntryType.PAYMENT,
                amount=payment_remaining if payment_remaining > 0 else data['amount'],
                reference=reference,
                note=note,
            ))
        return Response({
            'customer': CustomerSerializer(customer).data,
            'ledger_entry': CustomerLedgerEntrySerializer(new_entries[0]).data,
            'ledger_entries': CustomerLedgerEntrySerializer(new_entries, many=True).data,
        }, status=201)


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['expense_number', 'merchant', 'description', 'reference', 'category']
    ordering_fields = ['expense_date', 'total_amount', 'created_at']
    ordering = ['-expense_date', '-created_at']

    def get_queryset(self):
        queryset = super().get_queryset()
        category = self.request.query_params.get('category')
        status = self.request.query_params.get('status')
        payment_method = self.request.query_params.get('payment_method')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if category:
            queryset = queryset.filter(category=category)
        if status and status != 'all':
            queryset = queryset.filter(status=status)
        if payment_method and payment_method != 'all':
            queryset = queryset.filter(payment_method=payment_method)
        if start_date:
            queryset = queryset.filter(expense_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(expense_date__lte=end_date)
        return queryset


class ExpenseBudgetViewSet(viewsets.ModelViewSet):
    queryset = ExpenseBudget.objects.all()
    serializer_class = ExpenseBudgetSerializer


def sync_notifications():
    active_keys = []

    def sync(source_key, **values):
        active_keys.append(source_key)
        notification, created = Notification.objects.get_or_create(
            source_key=source_key,
            defaults={**values, 'is_active': True},
        )
        if created:
            return
        became_active = not notification.is_active
        for field, value in values.items():
            setattr(notification, field, value)
        notification.is_active = True
        if became_active:
            notification.is_read = False
            notification.is_dismissed = False
            notification.created_at = timezone.now()
        notification.save()

    for product in Product.objects.select_related('supplier').filter(is_active=True).filter(Q(quantity=0) | Q(quantity__lte=F('reorder_level'))):
        if product.quantity == 0:
            state = 'depleted'
            severity = Notification.Severity.CRITICAL
            title = 'Out of stock'
            message = f'{product.name} ({product.sku}) has no units remaining.'
        else:
            state = 'low'
            severity = Notification.Severity.WARNING
            title = 'Low stock'
            message = f'{product.name} ({product.sku}) has {product.quantity} units; the reorder level is {product.reorder_level}.'
        sync(
            f'stock:{product.id}:{state}',
            category=Notification.Category.STOCK,
            severity=severity,
            title=title,
            message=message,
            target_label=product.sku,
            dashboard='inventory',
        )

    today = timezone.localdate()
    for purchase in Purchase.objects.select_related('supplier').filter(
        status=Purchase.Status.ORDERED,
        expected_delivery__lte=today + timedelta(days=2),
    ):
        overdue = purchase.expected_delivery < today
        sync(
            f'purchase:{purchase.id}:delivery',
            category=Notification.Category.PROCUREMENT,
            severity=Notification.Severity.WARNING if overdue else Notification.Severity.INFO,
            title='Purchase delivery overdue' if overdue else 'Purchase delivery due soon',
            message=f'{purchase.reference} from {purchase.supplier.name} was due {purchase.expected_delivery}.' if overdue else f'{purchase.reference} from {purchase.supplier.name} is due {purchase.expected_delivery}.',
            target_label=purchase.reference,
            dashboard='purchases',
        )

    for expense in Expense.objects.filter(status=Expense.Status.PENDING).order_by('-created_at')[:10]:
        sync(
            f'expense:{expense.id}:approval',
            category=Notification.Category.OPERATIONS,
            severity=Notification.Severity.WARNING,
            title='Expense awaiting approval',
            message=f'{expense.merchant}: {expense.description} ({expense.total_amount} UGX) is pending approval.',
            target_label=expense.expense_number,
            dashboard='expenses',
        )

    for customer in Customer.objects.filter(outstanding_balance__gt=0).order_by('-outstanding_balance')[:10]:
        sync(
            f'customer:{customer.id}:balance',
            category=Notification.Category.BILLING,
            severity=Notification.Severity.INFO,
            title='Customer balance outstanding',
            message=f'{customer.name} has an outstanding balance of {customer.outstanding_balance} UGX.',
            target_label=customer.customer_code,
            dashboard='customers',
        )

    generated_sources = Q(source_key__startswith='stock:') | Q(source_key__startswith='purchase:') | Q(source_key__startswith='expense:') | Q(source_key__startswith='customer:')
    Notification.objects.filter(generated_sources, is_active=True).exclude(source_key__in=active_keys).update(is_active=False)


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        sync_notifications()
        return Notification.objects.filter(is_active=True, is_dismissed=False)

    @action(detail=False, methods=['post'])
    def read_all(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'updated': updated})

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read', 'updated_at'])
        return Response(self.get_serializer(notification).data)

    @action(detail=True, methods=['post'])
    def dismiss(self, request, pk=None):
        notification = self.get_object()
        notification.is_dismissed = True
        notification.is_read = True
        notification.save(update_fields=['is_dismissed', 'is_read', 'updated_at'])
        return Response(status=204)


class StaffMemberViewSet(viewsets.ModelViewSet):
    queryset = StaffMember.objects.all()
    serializer_class = StaffMemberSerializer
    permission_classes = [RoleModelPermissions]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['employee_number', 'full_name', 'job_title', 'department', 'email']
    ordering_fields = ['full_name', 'department', 'hire_date', 'pay_rate']
    ordering = ['full_name']

    def perform_create(self, serializer):
        worker = serializer.save()
        SecurityAuditEvent.objects.create(
            actor=self.request.user,
            action='staff.created',
            target_type='staff_member',
            target_id=worker.employee_number,
            details={'full_name': worker.full_name, 'department': worker.department},
        )

    def perform_update(self, serializer):
        worker = serializer.save()
        SecurityAuditEvent.objects.create(
            actor=self.request.user,
            action='staff.updated',
            target_type='staff_member',
            target_id=worker.employee_number,
            details={'full_name': worker.full_name, 'updated_fields': sorted(serializer.validated_data.keys())},
        )


class StaffAttendanceViewSet(viewsets.ViewSet):
    permission_classes = [RoleModelPermissions]

    def list(self, request):
        period = request.query_params.get('period', '')
        if period:
            try:
                parsed_period = datetime.strptime(period, '%Y-%m')
            except (TypeError, ValueError):
                raise ValidationError({'period': 'Enter an attendance month in YYYY-MM format.'})
            if parsed_period.strftime('%Y-%m') != period:
                raise ValidationError({'period': 'Enter an attendance month in YYYY-MM format.'})
            records = StaffAttendance.objects.filter(date__year=parsed_period.year, date__month=parsed_period.month).select_related('worker')
            return Response(StaffAttendanceSerializer(records, many=True).data)

        date_value = request.query_params.get('date', '')
        try:
            attendance_date = datetime.strptime(date_value, '%Y-%m-%d').date()
        except (TypeError, ValueError):
            raise ValidationError({'date': 'Enter an attendance date in YYYY-MM-DD format.'})
        if attendance_date.isoformat() != date_value:
            raise ValidationError({'date': 'Enter an attendance date in YYYY-MM-DD format.'})
        records = StaffAttendance.objects.filter(date=attendance_date).select_related('worker')
        return Response(StaffAttendanceSerializer(records, many=True).data)

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def record_day(self, request):
        date_value = request.data.get('date', '')
        try:
            attendance_date = datetime.strptime(date_value, '%Y-%m-%d').date()
        except (TypeError, ValueError):
            raise ValidationError({'date': 'Enter an attendance date in YYYY-MM-DD format.'})
        if attendance_date.isoformat() != date_value or attendance_date > timezone.localdate():
            raise ValidationError({'date': 'Choose a valid date that is not in the future.'})
        if PayrollRun.objects.filter(period=attendance_date.strftime('%Y-%m')).exists():
            raise ValidationError({'period': 'Attendance is locked because payroll for this month has been generated.'})
        records_data = request.data.get('records')
        if not isinstance(records_data, list) or not records_data:
            raise ValidationError({'records': 'Add at least one worker attendance record.'})
        serializer = StaffAttendanceInputSerializer(data=records_data, many=True)
        serializer.is_valid(raise_exception=True)
        worker_ids = [row['worker'].id for row in serializer.validated_data]
        if len(worker_ids) != len(set(worker_ids)):
            raise ValidationError({'records': 'A worker can only be recorded once per day.'})

        saved_records = []
        for row in serializer.validated_data:
            worker = row['worker']
            if worker.status != StaffMember.Status.ACTIVE:
                raise ValidationError({'worker': f'{worker.full_name} must be an active worker.'})
            attended = row['attended']
            output_quantity = row['output_quantity']
            daily_wage = Decimal('0.00')
            if attended and worker.pay_basis == StaffMember.PayBasis.DAILY:
                if attendance_date.weekday() == 6:
                    daily_wage = SUNDAY_DAILY_WAGE
                elif output_quantity >= DAILY_TARGET_UNITS:
                    daily_wage = DAILY_TARGET_MET_WAGE
                else:
                    daily_wage = DAILY_TARGET_MISSED_WAGE
            attendance, _ = StaffAttendance.objects.update_or_create(
                worker=worker,
                date=attendance_date,
                defaults={
                    'attended': attended,
                    'output_quantity': output_quantity,
                    'daily_wage': daily_wage,
                    'recorded_by': request.user,
                },
            )
            saved_records.append(attendance)

        SecurityAuditEvent.objects.create(
            actor=request.user,
            action='staff.attendance_recorded',
            target_type='staff_attendance',
            target_id=attendance_date.isoformat(),
            details={'workers_recorded': len(saved_records)},
        )
        return Response(StaffAttendanceSerializer(saved_records, many=True).data)


@api_view(['GET'])
@permission_classes([RoleModelPermissions])
def staff_dashboard(request):
    current_period = request.query_params.get('period') or timezone.localdate().strftime('%Y-%m')
    try:
        parsed_period = datetime.strptime(current_period, '%Y-%m')
    except (TypeError, ValueError):
        raise ValidationError({'period': 'Enter a payroll period in YYYY-MM format.'})
    if parsed_period.strftime('%Y-%m') != current_period:
        raise ValidationError({'period': 'Enter a payroll period in YYYY-MM format.'})
    workers = StaffMember.objects.all()
    active_workers = list(workers.filter(status=StaffMember.Status.ACTIVE))
    current_run = PayrollRun.objects.filter(period=current_period).prefetch_related('lines').first()
    cent = Decimal('0.01')
    attendance_totals = {
        row['worker_id']: {'days_worked': row['days_worked'], 'gross': row['gross'] or Decimal('0.00')}
        for row in StaffAttendance.objects.filter(date__year=parsed_period.year, date__month=parsed_period.month, attended=True)
        .values('worker_id')
        .annotate(days_worked=Count('id'), gross=Sum('daily_wage'))
    }

    def estimate(worker):
        if worker.pay_basis == StaffMember.PayBasis.DAILY:
            gross = attendance_totals.get(worker.id, {}).get('gross', Decimal('0.00'))
        else:
            gross = worker.pay_rate if worker.pay_basis == StaffMember.PayBasis.MONTHLY else worker.pay_rate * worker.hours_per_period
        gross = gross.quantize(cent, rounding=ROUND_HALF_UP)
        withholding = (gross * worker.withholding_percent / Decimal('100')).quantize(cent, rounding=ROUND_HALF_UP)
        benefits = min(worker.benefit_deduction, gross) if worker.pay_basis == StaffMember.PayBasis.DAILY else worker.benefit_deduction
        return gross, withholding, benefits, gross - withholding - benefits

    preview = [estimate(worker) for worker in active_workers]
    summary = {
        'current_period': current_period,
        'active_workers': len(active_workers),
        'on_leave_workers': workers.filter(status=StaffMember.Status.LEAVE).count(),
        'inactive_workers': workers.filter(status=StaffMember.Status.INACTIVE).count(),
        'gross_total': current_run.gross_total if current_run else sum((row[0] for row in preview), Decimal('0')),
        'withholding_total': current_run.withholding_total if current_run else sum((row[1] for row in preview), Decimal('0')),
        'benefits_total': current_run.benefits_total if current_run else sum((row[2] for row in preview), Decimal('0')),
        'net_total': current_run.net_total if current_run else sum((row[3] for row in preview), Decimal('0')),
        'run_status': current_run.status if current_run else 'draft',
        'run_id': current_run.id if current_run else None,
        'run_count': PayrollRun.objects.count(),
    }
    departments = []
    for department in sorted({worker.department for worker in active_workers}):
        members = [worker for worker in active_workers if worker.department == department]
        total = sum((estimate(worker)[0] for worker in members), Decimal('0'))
        departments.append({'name': department, 'workers': len(members), 'gross_total': total})

    return Response({
        'summary': summary,
        'workers': StaffMemberSerializer(workers, many=True, context={'attendance_totals': attendance_totals}).data,
        'departments': departments,
        'payroll_runs': PayrollRunSerializer(PayrollRun.objects.prefetch_related('lines')[:12], many=True).data,
    })


class PayrollRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PayrollRun.objects.prefetch_related('lines').all()
    serializer_class = PayrollRunSerializer
    permission_classes = [RoleModelPermissions]

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def generate(self, request):
        period = request.data.get('period', '')
        try:
            parsed_period = datetime.strptime(period, '%Y-%m')
        except (TypeError, ValueError):
            raise ValidationError({'period': 'Enter a payroll period in YYYY-MM format.'})
        if parsed_period.strftime('%Y-%m') != period:
            raise ValidationError({'period': 'Enter a payroll period in YYYY-MM format.'})
        if PayrollRun.objects.filter(period=period).exists():
            raise ValidationError({'period': 'A payroll run already exists for this period.'})

        workers = list(StaffMember.objects.select_for_update().filter(status=StaffMember.Status.ACTIVE).order_by('id'))
        if not workers:
            raise ValidationError({'workers': 'Add at least one active worker before generating payroll.'})

        cent = Decimal('0.01')
        attendance_totals = {
            row['worker_id']: {'days_worked': row['days_worked'], 'gross': row['gross'] or Decimal('0.00')}
            for row in StaffAttendance.objects.filter(date__year=parsed_period.year, date__month=parsed_period.month, attended=True)
            .values('worker_id')
            .annotate(days_worked=Count('id'), gross=Sum('daily_wage'))
        }
        run = PayrollRun.objects.create(period=period, worker_count=len(workers), created_by=request.user)
        lines = []
        for worker in workers:
            hours = worker.hours_per_period if worker.pay_basis == StaffMember.PayBasis.HOURLY else Decimal('0')
            days_worked = attendance_totals.get(worker.id, {}).get('days_worked', 0)
            if worker.pay_basis == StaffMember.PayBasis.DAILY:
                gross = attendance_totals.get(worker.id, {}).get('gross', Decimal('0.00'))
            else:
                gross = worker.pay_rate if worker.pay_basis == StaffMember.PayBasis.MONTHLY else worker.pay_rate * hours
            gross = gross.quantize(cent, rounding=ROUND_HALF_UP)
            withholding = (gross * worker.withholding_percent / Decimal('100')).quantize(cent, rounding=ROUND_HALF_UP)
            benefits = min(worker.benefit_deduction, gross) if worker.pay_basis == StaffMember.PayBasis.DAILY else worker.benefit_deduction
            if withholding + benefits > gross:
                raise ValidationError({'worker': f'Deductions exceed gross pay for {worker.employee_number}.'})
            lines.append(PayrollLine(
                run=run,
                worker=worker,
                employee_number=worker.employee_number,
                worker_name=worker.full_name,
                job_title=worker.job_title,
                department=worker.department,
                pay_basis=worker.pay_basis,
                hours=hours,
                days_worked=days_worked,
                gross_pay=gross,
                withholding=withholding,
                benefits=benefits,
                net_pay=gross - withholding - benefits,
            ))
        PayrollLine.objects.bulk_create(lines)
        run.gross_total = sum((line.gross_pay for line in lines), Decimal('0'))
        run.withholding_total = sum((line.withholding for line in lines), Decimal('0'))
        run.benefits_total = sum((line.benefits for line in lines), Decimal('0'))
        run.net_total = sum((line.net_pay for line in lines), Decimal('0'))
        run.save(update_fields=['gross_total', 'withholding_total', 'benefits_total', 'net_total'])
        SecurityAuditEvent.objects.create(
            actor=request.user,
            action='payroll.generated',
            target_type='payroll_run',
            target_id=period,
            details={'worker_count': run.worker_count, 'gross_total': str(run.gross_total), 'net_total': str(run.net_total)},
        )
        return Response(PayrollRunSerializer(run).data, status=201)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def mark_paid(self, request, pk=None):
        run = PayrollRun.objects.select_for_update().get(pk=pk)
        if run.status == PayrollRun.Status.PAID:
            raise ValidationError({'status': 'This payroll run is already marked paid.'})
        run.status = PayrollRun.Status.PAID
        run.paid_at = timezone.now()
        run.save(update_fields=['status', 'paid_at'])
        SecurityAuditEvent.objects.create(
            actor=request.user,
            action='payroll.marked_paid',
            target_type='payroll_run',
            target_id=run.period,
            details={'net_total': str(run.net_total)},
        )
        return Response(PayrollRunSerializer(run).data)


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category', 'supplier').all()
    serializer_class = ProductSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['name', 'sku', 'category__name']
    ordering_fields = ['name', 'quantity', 'unit_price', 'updated_at']
    ordering = ['name']

    def get_queryset(self):
        queryset = super().get_queryset()
        category = self.request.query_params.get('category')
        supplier = self.request.query_params.get('supplier')
        status = self.request.query_params.get('stock_status')
        active = self.request.query_params.get('active')

        if active == 'true':
            queryset = queryset.filter(is_active=True)
        elif active == 'false':
            queryset = queryset.filter(is_active=False)
        if category and category.isdigit():
            queryset = queryset.filter(category_id=category)
        if supplier == 'none':
            queryset = queryset.filter(supplier__isnull=True)
        elif supplier and supplier.isdigit():
            queryset = queryset.filter(supplier_id=supplier)
        if status == 'in_stock':
            queryset = queryset.filter(quantity__gt=F('reorder_level'))
        elif status == 'low_stock':
            queryset = queryset.filter(quantity__gt=0, quantity__lte=F('reorder_level'))
        elif status == 'out_of_stock':
            queryset = queryset.filter(quantity=0)
        return queryset

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        has_history = (
            product.sale_items.exists()
            or product.purchase_items.exists()
            or product.movements.exists()
        )
        if has_history:
            return Response(
                {'detail': 'This product is linked to sales, purchases, or inventory movements. Deactivate it instead to preserve its history.'},
                status=409,
            )
        return super().destroy(request, *args, **kwargs)


class StockMovementViewSet(viewsets.ModelViewSet):
    queryset = StockMovement.objects.select_related('product').all()
    serializer_class = StockMovementSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        days = self.request.query_params.get('days')
        month = self.request.query_params.get('month')
        selected_date = self.request.query_params.get('date')
        if selected_date is not None:
            if days is not None or month is not None:
                raise ValidationError({'date': 'Use a single day, a rolling range, or a calendar month.'})
            try:
                parsed_date = datetime.strptime(selected_date, '%Y-%m-%d').date()
            except (TypeError, ValueError):
                raise ValidationError({'date': 'Enter a date in YYYY-MM-DD format.'})
            if parsed_date.isoformat() != selected_date:
                raise ValidationError({'date': 'Enter a date in YYYY-MM-DD format.'})
            start_at, end_at = day_range(parsed_date)
            return queryset.filter(created_at__gte=start_at, created_at__lt=end_at)
        if month is not None:
            if days is not None:
                raise ValidationError({'month': 'Use either a rolling range or a calendar month.'})
            try:
                parsed_month = datetime.strptime(month, '%Y-%m')
            except (TypeError, ValueError):
                raise ValidationError({'month': 'Enter a month in YYYY-MM format.'})
            if parsed_month.strftime('%Y-%m') != month:
                raise ValidationError({'month': 'Enter a month in YYYY-MM format.'})
            start_at, end_at = day_range(parsed_month.date().replace(day=1), (parsed_month.date().replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1))
            return queryset.filter(created_at__gte=start_at, created_at__lt=end_at)
        if days is None:
            return queryset
        allowed_ranges = {1, 7, 30, 90, 180, 365, 730, 1825, 3650, 18250, 36500, 73000}
        try:
            day_count = int(days)
        except (TypeError, ValueError):
            raise ValidationError({'days': 'Choose a supported audit history range.'})
        if day_count not in allowed_ranges:
            raise ValidationError({'days': 'Choose a supported audit history range.'})
        return queryset.filter(created_at__gte=timezone.now() - timedelta(days=day_count))

    @transaction.atomic
    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError
        product = Product.objects.select_for_update().get(pk=serializer.validated_data['product'].pk)
        movement_type = serializer.validated_data['movement_type']
        quantity = serializer.validated_data['quantity']
        delta = quantity if movement_type in ['inbound', 'return'] else -quantity if movement_type == 'outbound' else quantity
        if product.quantity + delta < 0:
            raise ValidationError({'quantity': 'This movement would reduce stock below zero.'})
        product.quantity += delta
        product.save(update_fields=['quantity', 'updated_at'])
        serializer.save(product=product)


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.select_related('supplier').prefetch_related('items__product', 'ledger_entries').all()
    serializer_class = PurchaseSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def receive(self, request, pk=None):
        purchase = Purchase.objects.select_for_update().select_related('supplier').get(pk=pk)
        if purchase.status != Purchase.Status.ORDERED:
            raise ValidationError({'status': 'Only ordered purchases can be received.'})

        items = PurchaseItem.objects.filter(purchase=purchase).order_by('product_id')
        received_value = Decimal('0')
        for item in items:
            product = Product.objects.select_for_update().get(pk=item.product_id)
            product.quantity += item.quantity
            product.cost_price = item.unit_cost
            product.save(update_fields=['quantity', 'cost_price', 'updated_at'])
            received_value += item.quantity * item.unit_cost
            StockMovement.objects.create(
                product=product,
                movement_type=StockMovement.MovementType.INBOUND,
                quantity=item.quantity,
                note=f'Received from {purchase.supplier.name}',
                reference=purchase.reference,
            )
        purchase.status = Purchase.Status.RECEIVED
        purchase.received_at = timezone.now()
        purchase.save(update_fields=['status', 'received_at'])
        supplier = Supplier.objects.select_for_update().get(pk=purchase.supplier_id)
        supplier.outstanding_balance += received_value
        supplier.save(update_fields=['outstanding_balance'])
        SupplierLedgerEntry.objects.create(
            supplier=supplier,
            purchase=purchase,
            entry_type=SupplierLedgerEntry.EntryType.CHARGE,
            amount=received_value,
            reference=purchase.reference,
            note='Goods received; payable recorded',
        )
        return Response(self.get_serializer(purchase).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def payments(self, request, pk=None):
        serializer = SupplierPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        purchase = self.get_object()
        purchase = Purchase.objects.select_for_update().select_related('supplier').get(pk=purchase.pk)
        if purchase.status != Purchase.Status.RECEIVED:
            raise ValidationError({'status': 'A purchase must be received before a supplier payment can be recorded.'})

        purchase_total = sum(
            (item.quantity * item.unit_cost for item in purchase.items.all()),
            Decimal('0'),
        )
        paid_amount = purchase.ledger_entries.filter(
            entry_type=SupplierLedgerEntry.EntryType.PAYMENT,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        remaining_balance = max(purchase_total - paid_amount, Decimal('0'))
        if data['amount'] > remaining_balance:
            raise ValidationError({'amount': f'Payment cannot exceed this purchase balance of {remaining_balance:.2f}.'})

        supplier = Supplier.objects.select_for_update().get(pk=purchase.supplier_id)
        if data['amount'] > supplier.outstanding_balance:
            raise ValidationError({
                'amount': f'Payment cannot exceed the supplier account balance of {supplier.outstanding_balance:.2f}.',
            })
        supplier.outstanding_balance -= data['amount']
        supplier.save(update_fields=['outstanding_balance'])
        from uuid import uuid4
        entry = SupplierLedgerEntry.objects.create(
            supplier=supplier,
            purchase=purchase,
            entry_type=SupplierLedgerEntry.EntryType.PAYMENT,
            amount=data['amount'],
            reference=data.get('reference', '').strip() or f'PAY-{uuid4().hex[:8].upper()}',
            note=data.get('note', '').strip() or f'Supplier payment confirmed for {purchase.reference}',
        )
        return Response({
            'purchase': self.get_serializer(purchase).data,
            'ledger_entry': SupplierLedgerEntrySerializer(entry).data,
        }, status=201)


class SaleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Sale.objects.prefetch_related('items', 'ledger_entries').all()
    serializer_class = SaleSerializer


@api_view(['POST'])
@transaction.atomic
def checkout(request):
    serializer = SaleCheckoutSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    cart_items = data['items']
    product_ids = [item['product'].id for item in cart_items]
    locked_products = Product.objects.select_for_update().filter(pk__in=product_ids).order_by('id')
    products = {product.id: product for product in locked_products}
    for item in cart_items:
        product = products.get(item['product'].id)
        if product is None or not product.is_active:
            raise ValidationError({'items': 'One or more products are no longer available.'})
        if product.quantity < item['quantity']:
            raise ValidationError({'items': f'Only {product.quantity} units of {product.sku} are in stock.'})

    customer = data.get('customer')
    if customer is not None:
        customer = Customer.objects.select_for_update().get(pk=customer.pk)
        if not customer.is_active:
            raise ValidationError({'customer': 'This customer account is inactive.'})

    cent = Decimal('0.01')
    tax_rate = Decimal('0')
    subtotal = sum(
        (products[item['product'].id].unit_price * item['quantity'] for item in cart_items),
        Decimal('0'),
    ).quantize(cent, rounding=ROUND_HALF_UP)
    discount_percent = data['discount_percent']
    discount_amount = (subtotal * discount_percent / Decimal('100')).quantize(cent, rounding=ROUND_HALF_UP)
    taxable_subtotal = subtotal - discount_amount
    tax_amount = (taxable_subtotal * tax_rate / Decimal('100')).quantize(cent, rounding=ROUND_HALF_UP)
    total = subtotal - discount_amount + tax_amount
    if data['payment_method'] == Sale.PaymentMethod.ACCOUNT:
        if customer.credit_limit <= 0:
            raise ValidationError({'customer': 'This customer does not have an approved credit limit.'})
        if customer.outstanding_balance + total > customer.credit_limit:
            available_credit = max(customer.credit_limit - customer.outstanding_balance, Decimal('0'))
            raise ValidationError({'customer': f'Available credit is {available_credit}; this sale totals {total}.'})
    cash_tendered = data.get('cash_tendered')
    if data['payment_method'] == Sale.PaymentMethod.CASH:
        if cash_tendered is None:
            raise ValidationError({'cash_tendered': 'Enter the cash received for this sale.'})
        if cash_tendered <= 0:
            raise ValidationError({'cash_tendered': 'Cash received must be greater than zero.'})
        remaining_balance = max(total - cash_tendered, Decimal('0'))
        if remaining_balance > 0:
            if customer is None:
                raise ValidationError({'customer': 'Select a customer to record the remaining balance.'})
            if customer.credit_limit <= 0:
                raise ValidationError({'customer': 'This customer does not have an approved credit limit.'})
            if customer.outstanding_balance + remaining_balance > customer.credit_limit:
                available_credit = max(customer.credit_limit - customer.outstanding_balance, Decimal('0'))
                raise ValidationError({'customer': f'Available credit is {available_credit}; the remaining balance is {remaining_balance}.'})
    else:
        cash_tendered = None

    from uuid import uuid4
    receipt_number = f"SALE-{timezone.now().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
    sale = Sale.objects.create(
        receipt_number=receipt_number,
        customer=customer,
        customer_name=(customer.name if customer else data.get('customer_name', '').strip()) or 'Walk-in Customer',
        payment_method=data['payment_method'],
        subtotal=subtotal,
        discount_percent=discount_percent,
        discount_amount=discount_amount,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        total=total,
        cash_tendered=cash_tendered,
        change_due=(cash_tendered - total) if cash_tendered is not None else Decimal('0'),
    )
    sale_items = []
    movements = []
    for item in cart_items:
        product = products[item['product'].id]
        quantity = item['quantity']
        sale_items.append(SaleItem(
            sale=sale,
            product=product,
            product_name=product.name,
            product_sku=product.sku,
            quantity=quantity,
            unit_price=product.unit_price,
            unit_cost=product.cost_price,
        ))
        product.quantity -= quantity
        product.save(update_fields=['quantity', 'updated_at'])
        movements.append(StockMovement(
            product=product,
            movement_type=StockMovement.MovementType.OUTBOUND,
            quantity=quantity,
            note=f'POS sale to {sale.customer_name}',
            reference=receipt_number,
        ))
    SaleItem.objects.bulk_create(sale_items)
    StockMovement.objects.bulk_create(movements)
    if data['payment_method'] == Sale.PaymentMethod.ACCOUNT:
        customer.outstanding_balance += total
        customer.save(update_fields=['outstanding_balance'])
        CustomerLedgerEntry.objects.create(
            customer=customer,
            sale=sale,
            entry_type=CustomerLedgerEntry.EntryType.CHARGE,
            amount=total,
            reference=receipt_number,
            note='POS sale on account',
        )
    elif cash_tendered is not None and cash_tendered < total:
        remaining_balance = total - cash_tendered
        customer.outstanding_balance += remaining_balance
        customer.save(update_fields=['outstanding_balance'])
        CustomerLedgerEntry.objects.create(
            customer=customer,
            sale=sale,
            entry_type=CustomerLedgerEntry.EntryType.CHARGE,
            amount=total,
            reference=receipt_number,
            note='POS sale with partial payment',
        )
        CustomerLedgerEntry.objects.create(
            customer=customer,
            sale=sale,
            entry_type=CustomerLedgerEntry.EntryType.PAYMENT,
            amount=cash_tendered,
            reference=receipt_number,
            note='POS partial cash payment',
        )
    sale = Sale.objects.prefetch_related('items', 'ledger_entries').get(pk=sale.pk)
    return Response(SaleSerializer(sale).data, status=201)


@api_view(['POST'])
@transaction.atomic
def inventory_adjustment(request):
    serializer = StockAdjustmentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    product = Product.objects.select_for_update().get(pk=data['product'].pk)
    adjustment_type = data['adjustment_type']
    if adjustment_type == 'count':
        delta = data['counted_quantity'] - product.quantity
    else:
        quantity = data['quantity']
        delta = quantity if adjustment_type == 'increase' else -quantity
    if delta == 0:
        raise ValidationError({'counted_quantity': 'The counted quantity matches current stock; no adjustment is needed.'})
    if product.quantity + delta < 0:
        raise ValidationError({'quantity': 'This adjustment would reduce stock below zero.'})

    product.quantity += delta
    product.save(update_fields=['quantity', 'updated_at'])
    note = data['reason']
    if data.get('notes'):
        note = f"{note}: {data['notes']}"
    movement = StockMovement.objects.create(
        product=product,
        movement_type=StockMovement.MovementType.ADJUSTMENT,
        quantity=delta,
        note=note,
        reference=data.get('reference', ''),
    )
    return Response(StockMovementSerializer(movement).data, status=201)


@api_view(['GET'])
def purchase_summary(request):
    month_start = timezone.localdate().replace(day=1)
    month_start_at, _ = day_range(month_start)
    open_purchases = Purchase.objects.filter(status=Purchase.Status.ORDERED).prefetch_related('items')
    received_this_month = Purchase.objects.filter(
        status=Purchase.Status.RECEIVED,
        received_at__gte=month_start_at,
    ).prefetch_related('items')
    open_value = sum(
        (item.quantity * item.unit_cost for purchase in open_purchases for item in purchase.items.all()),
        Decimal('0'),
    )
    monthly_spend = sum(
        (item.quantity * item.unit_cost for purchase in received_this_month for item in purchase.items.all()),
        Decimal('0'),
    )
    return Response({
        'total_orders': Purchase.objects.count(),
        'open_orders': open_purchases.count(),
        'received_this_month': received_this_month.count(),
        'open_value': str(open_value),
        'spent_this_month': str(monthly_spend),
        'recent_purchases': PurchaseSerializer(
            Purchase.objects.select_related('supplier').prefetch_related('items__product')[:8],
            many=True,
        ).data,
    })


@api_view(['GET'])
def sales_summary(request):
    today = timezone.localdate()
    today_start, today_end = day_range(today)
    todays_sales = Sale.objects.filter(created_at__gte=today_start, created_at__lt=today_end)
    totals = todays_sales.aggregate(total=Sum('total'))
    return Response({
        'today_sales': str(totals['total'] or Decimal('0')),
        'transactions_today': todays_sales.count(),
        'recent_sales': SaleSerializer(
            Sale.objects.prefetch_related('items', 'ledger_entries')[:8],
            many=True,
        ).data,
    })


@api_view(['GET'])
def reports_summary(request):
    selected_date = request.query_params.get('date')
    if selected_date is not None:
        try:
            report_date = datetime.strptime(selected_date, '%Y-%m-%d').date()
        except (TypeError, ValueError):
            raise ValidationError({'date': 'Enter a date in YYYY-MM-DD format.'})
        if report_date.isoformat() != selected_date:
            raise ValidationError({'date': 'Enter a date in YYYY-MM-DD format.'})
        return Response(build_report_summary(1, report_date, report_date))

    month = request.query_params.get('month')
    if month is not None:
        try:
            month_start = datetime.strptime(month, '%Y-%m').date().replace(day=1)
        except ValueError:
            raise ValidationError({'month': 'Enter a month in YYYY-MM format.'})
        if month_start.strftime('%Y-%m') != month:
            raise ValidationError({'month': 'Enter a month in YYYY-MM format.'})
        next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        month_end = next_month - timedelta(days=1)
        month_days = (month_end - month_start).days + 1
        return Response(build_report_summary(month_days, month_start, month_end))

    range_days = request.query_params.get('range', '30d')
    days = {
        '1d': 1, '7d': 7, '30d': 30, '90d': 90, '180d': 180, '365d': 365,
        '730d': 730, '1825d': 1825, '3650d': 3650, '18250d': 18250,
        '36500d': 36500, '73000d': 73000,
    }.get(range_days, 30)
    return Response(build_report_summary(days))


@api_view(['GET'])
def expenses_summary(request):
    month_value = request.query_params.get('month')
    if month_value:
        try:
            start = datetime.strptime(month_value, '%Y-%m').date().replace(day=1)
        except ValueError:
            raise ValidationError({'month': 'Use YYYY-MM for the report month.'})
    else:
        start = timezone.localdate().replace(day=1)
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    end = next_month - timedelta(days=1)
    expense_records = Expense.objects.filter(expense_date__gte=start, expense_date__lte=end)
    expenses = expense_records.exclude(status=Expense.Status.REJECTED)
    totals = expenses.aggregate(total=Sum('total_amount'))
    pending = expenses.filter(status=Expense.Status.PENDING).aggregate(total=Sum('total_amount'))
    tax_reclaimable = expenses.filter(receipt_verified=True).aggregate(total=Sum('tax_amount'))
    money = lambda value: str((value or Decimal('0')).quantize(Decimal('0.01')))
    categories = list(expenses.values('category').annotate(
        total=Sum('total_amount'),
        count=Count('id'),
    ).order_by('-total'))
    budget_rows = []
    for budget in ExpenseBudget.objects.all():
        spend = expenses.filter(category=budget.category).aggregate(total=Sum('total_amount'))['total'] or Decimal('0')
        budget_rows.append({
            'id': budget.id,
            'category': budget.category,
            'cost_center': budget.cost_center,
            'manager': budget.manager,
            'monthly_limit': money(budget.monthly_limit),
            'spent': money(spend),
            'percent_used': round(float(spend / budget.monthly_limit * 100), 1) if budget.monthly_limit else 0,
        })
    largest = categories[0] if categories else None
    daily_by_type = {}
    for row in expenses.values('expense_date', 'expense_type').annotate(total=Sum('total_amount')):
        daily_by_type.setdefault(row['expense_date'], {})[row['expense_type']] = row['total']
    series = []
    cursor = start
    while cursor <= end:
        type_totals = daily_by_type.get(cursor, {})
        series.append({
            'label': f'{cursor.strftime("%b")} {cursor.day}',
            'total': float(sum(type_totals.values(), Decimal('0'))),
            'operational': float(type_totals.get(Expense.ExpenseType.OPERATIONAL, Decimal('0'))),
            'freight': float(type_totals.get(Expense.ExpenseType.FREIGHT, Decimal('0'))),
            'capital': float(type_totals.get(Expense.ExpenseType.CAPITAL, Decimal('0'))),
        })
        cursor += timedelta(days=1)
    return Response({
        'month': start.strftime('%Y-%m'),
        'start_date': start.isoformat(),
        'end_date': end.isoformat(),
        'total_expenses': money(totals['total']),
        'pending_approval': money(pending['total']),
        'pending_count': expenses.filter(status=Expense.Status.PENDING).count(),
        'tax_reclaimable': money(tax_reclaimable['total']),
        'verified_receipts': expenses.filter(receipt_verified=True).count(),
        'expense_count': expenses.count(),
        'largest_category': {
            'name': largest['category'],
            'total': money(largest['total']),
            'percent': round(float(largest['total'] / (totals['total'] or Decimal('1')) * 100), 1),
        } if largest else None,
        'categories': [{
            'name': row['category'],
            'total': money(row['total']),
            'count': row['count'],
            'percent': round(float(row['total'] / (totals['total'] or Decimal('1')) * 100), 1),
        } for row in categories],
        'budgets': budget_rows,
        'daily_series': series,
        'expenses': ExpenseSerializer(expense_records, many=True).data,
    })


@api_view(['POST'])
@transaction.atomic
def expenses_bulk_upload(request):
    rows = request.data.get('expenses')
    if not isinstance(rows, list) or not rows:
        raise ValidationError({'expenses': 'Provide a non-empty list of expense records.'})
    serializer = ExpenseSerializer(data=rows, many=True)
    serializer.is_valid(raise_exception=True)
    created = serializer.save()
    return Response(ExpenseSerializer(created, many=True).data, status=201)


@api_view(['GET'])
def dashboard_summary(request):
    products = Product.objects.select_related('category', 'supplier').filter(is_active=True)
    summary_products = ProductSerializer(products.order_by('quantity')[:8], many=True).data
    product_totals = products.aggregate(
        total_skus=Count('id'),
        total_units=Sum('quantity'),
        inventory_value=Sum(F('quantity') * F('cost_price')),
        low_stock_count=Count('id', filter=Q(quantity__gt=0, quantity__lte=F('reorder_level'))),
        out_of_stock_count=Count('id', filter=Q(quantity=0)),
    )
    today = timezone.localdate()
    days = 30 if request.query_params.get('range') == '30d' else 7
    start = today - timedelta(days=days - 1)
    start_at, end_at = day_range(start, today)
    movement_queryset = StockMovement.objects.select_related('product', 'product__supplier')
    period_movements = list(movement_queryset.filter(created_at__gte=start_at, created_at__lt=end_at))
    sale_revenue_by_date = {}
    sale_cost_by_date = {}
    sale_receipts = set()
    for sale in Sale.objects.prefetch_related('items').filter(created_at__gte=start_at, created_at__lt=end_at):
        sale_date = timezone.localtime(sale.created_at).date()
        sale_revenue_by_date[sale_date] = sale_revenue_by_date.get(sale_date, Decimal('0')) + sale.subtotal - sale.discount_amount
        sale_cost_by_date[sale_date] = sale_cost_by_date.get(sale_date, Decimal('0')) + sum(
            (item.quantity * item.unit_cost for item in sale.items.all()), Decimal('0'),
        )
        sale_receipts.add(sale.receipt_number)
    legacy_sales_by_date = {}
    purchases_by_date = {}
    legacy_sales_total = Decimal('0')
    legacy_sales_cost = Decimal('0')
    purchases = Decimal('0')
    today_purchases = Decimal('0')
    for movement in period_movements:
        movement_date = timezone.localtime(movement.created_at).date()
        if movement.movement_type == 'inbound':
            amount = abs(movement.quantity) * movement.product.cost_price
            purchases += amount
            purchases_by_date[movement_date] = purchases_by_date.get(movement_date, Decimal('0')) + amount
            if movement_date == today:
                today_purchases += amount
        elif movement.movement_type == 'outbound' and movement.reference not in sale_receipts:
            revenue = abs(movement.quantity) * movement.product.unit_price
            cost = abs(movement.quantity) * movement.product.cost_price
            legacy_sales_by_date[movement_date] = legacy_sales_by_date.get(movement_date, Decimal('0')) + revenue
            legacy_sales_total += revenue
            legacy_sales_cost += cost

    sales = sum(sale_revenue_by_date.values(), Decimal('0')) + legacy_sales_total
    today_sales = sale_revenue_by_date.get(today, Decimal('0')) + legacy_sales_by_date.get(today, Decimal('0'))
    period_cost = sum(sale_cost_by_date.values(), Decimal('0')) + legacy_sales_cost
    category_rows = [
        {
            'id': row['category_id'],
            'name': row['category__name'],
            'units': row['units'],
            'value': str(row['value'] or Decimal('0')),
        }
        for row in products.values('category_id', 'category__name')
        .annotate(units=Sum('quantity'), value=Sum(F('quantity') * F('cost_price')))
        .filter(units__gt=0)
        .order_by('-units')
    ]
    total_category_units = sum(item['units'] for item in category_rows) or 1
    for row in category_rows:
        row['percent'] = round(row['units'] * 100 / total_category_units)
    series = []
    for offset in range(days):
        date = start + timedelta(days=offset)
        series.append({
            'label': f'{date.strftime("%b")} {date.day}',
            'sales': float(sale_revenue_by_date.get(date, Decimal('0')) + legacy_sales_by_date.get(date, Decimal('0'))),
            'purchases': float(purchases_by_date.get(date, Decimal('0'))),
        })
    gross_profit = sales - period_cost
    gross_margin = round(float(gross_profit / sales * 100), 1) if sales else 0
    recent_movements = StockMovementSerializer(movement_queryset[:12], many=True).data
    return Response({
        'total_skus': product_totals['total_skus'],
        'total_units': product_totals['total_units'] or 0,
        'inventory_value': str(product_totals['inventory_value'] or Decimal('0')),
        'low_stock_count': product_totals['low_stock_count'],
        'out_of_stock_count': product_totals['out_of_stock_count'],
        'today_sales': str(today_sales),
        'today_purchases': str(today_purchases),
        'gross_profit': str(gross_profit),
        'gross_margin': gross_margin,
        'period_sales': str(sales),
        'period_purchases': str(purchases),
        'products': summary_products,
        'recent_movements': recent_movements,
        'categories': category_rows,
        'series': series,
    })

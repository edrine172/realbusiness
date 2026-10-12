from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers
from .models import Category, Customer, CustomerLedgerEntry, Expense, ExpenseBudget, Notification, PayrollLine, PayrollRun, Product, Purchase, PurchaseItem, Sale, SaleItem, StaffAttendance, StaffMember, StockMovement, Supplier, SupplierLedgerEntry


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class SupplierSerializer(serializers.ModelSerializer):
    lifetime_spend = serializers.SerializerMethodField()
    completed_orders = serializers.SerializerMethodField()
    on_time_delivery_rate = serializers.SerializerMethodField()

    def _received_orders(self, supplier):
        return [purchase for purchase in supplier.purchases.all() if purchase.status == Purchase.Status.RECEIVED]

    def get_lifetime_spend(self, supplier):
        total = sum(
            (item.quantity * item.unit_cost for purchase in self._received_orders(supplier) for item in purchase.items.all()),
            Decimal('0'),
        )
        return str(total.quantize(Decimal('0.01')))

    def get_completed_orders(self, supplier):
        return len(self._received_orders(supplier))

    def get_on_time_delivery_rate(self, supplier):
        rated = [purchase for purchase in self._received_orders(supplier) if purchase.expected_delivery]
        if not rated:
            return None
        on_time = sum(1 for purchase in rated if purchase.received_at and purchase.received_at.date() <= purchase.expected_delivery)
        return round(on_time * 100 / len(rated), 1)

    class Meta:
        model = Supplier
        fields = [
            'id', 'supplier_code', 'name', 'contact_name', 'email', 'phone', 'sector',
            'account_manager', 'address', 'tax_number', 'contract_number', 'payment_terms',
            'outstanding_balance', 'is_active', 'lead_time_days', 'lifetime_spend',
            'completed_orders', 'on_time_delivery_rate', 'created_at',
        ]
        read_only_fields = ['id', 'supplier_code', 'outstanding_balance', 'lifetime_spend', 'completed_orders', 'on_time_delivery_rate', 'created_at']

    def create(self, validated_data):
        return Supplier.objects.create(**validated_data)


class CustomerSerializer(serializers.ModelSerializer):
    tax_exempt = serializers.SerializerMethodField()
    lifetime_revenue = serializers.SerializerMethodField()
    completed_orders = serializers.SerializerMethodField()

    def get_tax_exempt(self, customer):
        return False

    def get_lifetime_revenue(self, customer):
        from django.db.models import Sum
        total = customer.sales.aggregate(total=Sum('total'))['total'] or Decimal('0')
        return str(total.quantize(Decimal('0.01')))

    def get_completed_orders(self, customer):
        return customer.sales.count()

    def create(self, validated_data):
        from uuid import uuid4
        validated_data['customer_code'] = f'CUST-{uuid4().hex[:6].upper()}'
        return super().create(validated_data)

    class Meta:
        model = Customer
        fields = [
            'id', 'customer_code', 'name', 'contact_name', 'email', 'phone', 'sector', 'tier',
            'account_manager', 'billing_address', 'shipping_address', 'tax_number', 'tax_exempt',
            'payment_terms', 'credit_limit', 'outstanding_balance', 'is_active', 'lifetime_revenue',
            'completed_orders', 'created_at',
        ]
        read_only_fields = ['id', 'customer_code', 'tax_exempt', 'outstanding_balance', 'lifetime_revenue', 'completed_orders', 'created_at']


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default='')

    class Meta:
        model = Product
        fields = ['id', 'sku', 'name', 'category', 'category_name', 'supplier', 'supplier_name', 'quantity', 'reorder_level', 'is_active', 'unit_price', 'cost_price', 'location', 'updated_at', 'created_at']
        read_only_fields = ['id', 'updated_at', 'created_at']


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'category', 'severity', 'title', 'message', 'target_label', 'dashboard', 'is_read', 'created_at']
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    supplier_name = serializers.CharField(source='product.supplier.name', read_only=True, default='')
    amount = serializers.SerializerMethodField()

    def get_amount(self, movement):
        price = movement.product.cost_price if movement.movement_type == 'inbound' else movement.product.unit_price
        return str(abs(movement.quantity) * price)

    def validate(self, attrs):
        movement_type = attrs.get('movement_type', getattr(self.instance, 'movement_type', None))
        quantity = attrs.get('quantity', getattr(self.instance, 'quantity', 0))
        if movement_type != 'adjustment' and quantity <= 0:
            raise serializers.ValidationError({'quantity': 'Inbound, outbound, and return quantities must be greater than zero.'})
        if movement_type == 'adjustment' and quantity == 0:
            raise serializers.ValidationError({'quantity': 'An adjustment must change stock by a non-zero amount.'})
        return attrs

    class Meta:
        model = StockMovement
        fields = ['id', 'product', 'product_name', 'product_sku', 'supplier_name', 'movement_type', 'quantity', 'amount', 'note', 'reference', 'created_at']
        read_only_fields = ['id', 'created_at']


class StockAdjustmentSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    adjustment_type = serializers.ChoiceField(choices=['increase', 'decrease', 'damage', 'loss', 'count'])
    quantity = serializers.IntegerField(required=False, min_value=1)
    counted_quantity = serializers.IntegerField(required=False, min_value=0)
    reason = serializers.CharField(max_length=80)
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=158, required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs['adjustment_type'] == 'count' and 'counted_quantity' not in attrs:
            raise serializers.ValidationError({'counted_quantity': 'Enter the quantity found during the stock count.'})
        if attrs['adjustment_type'] != 'count' and 'quantity' not in attrs:
            raise serializers.ValidationError({'quantity': 'Enter the number of units to adjust.'})
        return attrs


class PurchaseItemSerializer(serializers.ModelSerializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    line_total = serializers.SerializerMethodField()

    def get_line_total(self, item):
        return str(item.quantity * item.unit_cost)

    class Meta:
        model = PurchaseItem
        fields = ['id', 'product', 'product_name', 'product_sku', 'quantity', 'unit_cost', 'line_total']
        read_only_fields = ['id']


class PurchaseSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    items = PurchaseItemSerializer(many=True)
    item_count = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    remaining_balance = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()

    def get_item_count(self, purchase):
        return sum(item.quantity for item in purchase.items.all())

    def get_total(self, purchase):
        return str(sum((item.quantity * item.unit_cost for item in purchase.items.all()), start=0))

    def get_paid_amount(self, purchase):
        return str(sum(
            (entry.amount for entry in purchase.ledger_entries.all()
             if entry.entry_type == SupplierLedgerEntry.EntryType.PAYMENT),
            start=Decimal('0'),
        ).quantize(Decimal('0.01')))

    def get_remaining_balance(self, purchase):
        total = sum((item.quantity * item.unit_cost for item in purchase.items.all()), start=Decimal('0'))
        paid = sum(
            (entry.amount for entry in purchase.ledger_entries.all()
             if entry.entry_type == SupplierLedgerEntry.EntryType.PAYMENT),
            start=Decimal('0'),
        )
        return str(max(total - paid, Decimal('0')).quantize(Decimal('0.01')))

    def get_payment_status(self, purchase):
        if purchase.status != Purchase.Status.RECEIVED:
            return 'not_due'
        return 'paid' if Decimal(self.get_remaining_balance(purchase)) == 0 else (
            'partial' if Decimal(self.get_paid_amount(purchase)) > 0 else 'unpaid'
        )

    def validate_items(self, items):
        product_ids = [item['product'].id for item in items]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError('Each product can appear only once per purchase order.')
        return items

    def create(self, validated_data):
        from uuid import uuid4
        items = validated_data.pop('items')
        validated_data['reference'] = f"PO-{timezone.now().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
        purchase = Purchase.objects.create(**validated_data)
        PurchaseItem.objects.bulk_create([
            PurchaseItem(purchase=purchase, **item) for item in items
        ])
        return purchase

    class Meta:
        model = Purchase
        fields = ['id', 'reference', 'supplier', 'supplier_name', 'status', 'items', 'item_count', 'total', 'paid_amount', 'remaining_balance', 'payment_status', 'notes', 'expected_delivery', 'ordered_at', 'received_at']
        read_only_fields = ['id', 'reference', 'status', 'ordered_at', 'received_at']


class SaleItemSerializer(serializers.ModelSerializer):
    line_total = serializers.SerializerMethodField()

    def get_line_total(self, item):
        return str(item.quantity * item.unit_price)

    class Meta:
        model = SaleItem
        fields = ['id', 'product', 'product_name', 'product_sku', 'quantity', 'unit_price', 'unit_cost', 'line_total']
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    customer = serializers.PrimaryKeyRelatedField(read_only=True)
    paid_amount = serializers.SerializerMethodField()
    remaining_balance = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()

    def get_paid_amount(self, sale):
        if sale.payment_method != Sale.PaymentMethod.ACCOUNT:
            return str(sale.total.quantize(Decimal('0.01')))
        paid_amounts = self.context.get('sale_paid_amounts')
        paid = paid_amounts.get(sale.id, Decimal('0')) if paid_amounts is not None else sum(
            (entry.amount for entry in sale.ledger_entries.all()
             if entry.entry_type == CustomerLedgerEntry.EntryType.PAYMENT),
            Decimal('0'),
        )
        return str(paid.quantize(Decimal('0.01')))

    def get_remaining_balance(self, sale):
        if sale.payment_method != Sale.PaymentMethod.ACCOUNT:
            return '0.00'
        return str(max(sale.total - Decimal(self.get_paid_amount(sale)), Decimal('0')).quantize(Decimal('0.01')))

    def get_payment_status(self, sale):
        remaining_balance = Decimal(self.get_remaining_balance(sale))
        if remaining_balance == 0:
            return 'paid'
        return 'partial' if Decimal(self.get_paid_amount(sale)) > 0 else 'unpaid'

    class Meta:
        model = Sale
        fields = [
            'id', 'receipt_number', 'customer', 'customer_name', 'payment_method', 'payment_method_display',
            'subtotal', 'discount_percent', 'discount_amount', 'tax_rate', 'tax_amount', 'total',
            'cash_tendered', 'change_due', 'paid_amount', 'remaining_balance', 'payment_status', 'items', 'created_at',
        ]
        read_only_fields = fields


class SaleCheckoutItemSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.filter(is_active=True))
    quantity = serializers.IntegerField(min_value=1)


class SaleCheckoutSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all(), required=False, allow_null=True)
    customer_name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    payment_method = serializers.ChoiceField(choices=Sale.PaymentMethod.choices)
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, default=0)
    cash_tendered = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)
    items = SaleCheckoutItemSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        product_ids = [item['product'].id for item in items]
        if len(product_ids) != len(set(product_ids)):
            raise serializers.ValidationError('Each product can appear only once in the cart.')
        return items

    def validate(self, attrs):
        customer = attrs.get('customer')
        if attrs['payment_method'] == Sale.PaymentMethod.ACCOUNT:
            if customer is None:
                raise serializers.ValidationError({'customer': 'Select a customer for an on-account sale.'})
            if not customer.is_active:
                raise serializers.ValidationError({'customer': 'This customer account is inactive.'})
        return attrs


class CustomerLedgerEntrySerializer(serializers.ModelSerializer):
    sale_reference = serializers.CharField(source='sale.receipt_number', read_only=True, default='')
    entry_type_display = serializers.CharField(source='get_entry_type_display', read_only=True)

    class Meta:
        model = CustomerLedgerEntry
        fields = ['id', 'entry_type', 'entry_type_display', 'amount', 'reference', 'note', 'sale_reference', 'created_at']


class CustomerPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True)
    note = serializers.CharField(max_length=240, required=False, allow_blank=True)
    sale = serializers.PrimaryKeyRelatedField(queryset=Sale.objects.all(), required=False)


class SupplierLedgerEntrySerializer(serializers.ModelSerializer):
    purchase_reference = serializers.CharField(source='purchase.reference', read_only=True, default='')
    entry_type_display = serializers.CharField(source='get_entry_type_display', read_only=True)

    class Meta:
        model = SupplierLedgerEntry
        fields = ['id', 'entry_type', 'entry_type_display', 'amount', 'reference', 'note', 'purchase_reference', 'created_at']


class SupplierPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    reference = serializers.CharField(max_length=80, required=False, allow_blank=True)
    note = serializers.CharField(max_length=240, required=False, allow_blank=True)


class ExpenseSerializer(serializers.ModelSerializer):
    payment_method_display = serializers.CharField(source='get_payment_method_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    amount_before_tax = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))
    tax_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False, default=Decimal('0'))

    def validate(self, attrs):
        amount_before_tax = attrs.get('amount_before_tax', getattr(self.instance, 'amount_before_tax', Decimal('0')))
        tax_amount = attrs.get('tax_amount', getattr(self.instance, 'tax_amount', Decimal('0')))
        if amount_before_tax + tax_amount <= 0:
            raise serializers.ValidationError({'amount_before_tax': 'Expense total must be greater than zero.'})
        receipt_received = attrs.get('receipt_received', getattr(self.instance, 'receipt_received', False))
        receipt_verified = attrs.get('receipt_verified', getattr(self.instance, 'receipt_verified', False))
        if receipt_verified and not receipt_received:
            raise serializers.ValidationError({'receipt_verified': 'A receipt must be received before it can be verified.'})
        return attrs

    def create(self, validated_data):
        from uuid import uuid4
        validated_data['expense_number'] = f"EXP-{timezone.now().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
        validated_data['total_amount'] = validated_data['amount_before_tax'] + validated_data.get('tax_amount', Decimal('0'))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'amount_before_tax' in validated_data or 'tax_amount' in validated_data:
            before_tax = validated_data.get('amount_before_tax', instance.amount_before_tax)
            tax = validated_data.get('tax_amount', instance.tax_amount)
            validated_data['total_amount'] = before_tax + tax
        return super().update(instance, validated_data)

    class Meta:
        model = Expense
        fields = [
            'id', 'expense_number', 'merchant', 'description', 'category', 'cost_center', 'expense_type',
            'amount_before_tax', 'tax_amount', 'total_amount', 'payment_method', 'payment_method_display',
            'status', 'status_display', 'reference', 'expense_date', 'receipt_received', 'receipt_verified',
            'entered_by', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'expense_number', 'total_amount', 'created_at', 'updated_at']


class ExpenseBudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseBudget
        fields = ['id', 'category', 'monthly_limit', 'cost_center', 'manager', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class StaffMemberSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    pay_basis_display = serializers.CharField(source='get_pay_basis_display', read_only=True)
    period_days_worked = serializers.SerializerMethodField()
    period_gross = serializers.SerializerMethodField()

    def get_period_days_worked(self, worker):
        return self.context.get('attendance_totals', {}).get(worker.id, {}).get('days_worked', 0)

    def get_period_gross(self, worker):
        totals = self.context.get('attendance_totals', {}).get(worker.id, {})
        return totals.get('gross', Decimal('0.00'))

    def validate(self, attrs):
        pay_basis = attrs.get('pay_basis', getattr(self.instance, 'pay_basis', StaffMember.PayBasis.MONTHLY))
        pay_rate = attrs.get('pay_rate', getattr(self.instance, 'pay_rate', Decimal('0')))
        hours = attrs.get('hours_per_period', getattr(self.instance, 'hours_per_period', Decimal('160')))
        withholding_percent = attrs.get('withholding_percent', getattr(self.instance, 'withholding_percent', Decimal('0')))
        benefits = attrs.get('benefit_deduction', getattr(self.instance, 'benefit_deduction', Decimal('0')))
        gross = pay_rate if pay_basis in (StaffMember.PayBasis.MONTHLY, StaffMember.PayBasis.DAILY) else pay_rate * hours
        if pay_rate <= 0:
            raise serializers.ValidationError({'pay_rate': 'Pay rate must be greater than zero.'})
        if pay_basis == StaffMember.PayBasis.HOURLY and hours <= 0:
            raise serializers.ValidationError({'hours_per_period': 'Hours per pay period must be greater than zero.'})
        if withholding_percent < 0 or withholding_percent > 100:
            raise serializers.ValidationError({'withholding_percent': 'Withholding must be between 0 and 100 percent.'})
        if benefits < 0 or (pay_basis != StaffMember.PayBasis.DAILY and gross * withholding_percent / Decimal('100') + benefits > gross):
            raise serializers.ValidationError({'benefit_deduction': 'Configured deductions cannot exceed gross pay.'})
        return attrs

    class Meta:
        model = StaffMember
        fields = [
            'id', 'employee_number', 'full_name', 'email', 'phone', 'job_title', 'department',
            'pay_basis', 'pay_basis_display', 'pay_rate', 'hours_per_period', 'withholding_percent',
            'benefit_deduction', 'status', 'status_display', 'hire_date', 'period_days_worked', 'period_gross', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'employee_number', 'created_at', 'updated_at']


class PayrollLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollLine
        fields = [
            'id', 'worker', 'employee_number', 'worker_name', 'job_title', 'department',
            'pay_basis', 'hours', 'days_worked', 'gross_pay', 'withholding', 'benefits', 'net_pay',
        ]


class StaffAttendanceInputSerializer(serializers.Serializer):
    worker = serializers.PrimaryKeyRelatedField(queryset=StaffMember.objects.all())
    attended = serializers.BooleanField()
    output_quantity = serializers.IntegerField(min_value=0, required=False, default=0)

    def validate(self, attrs):
        if not attrs['attended'] or attrs['worker'].pay_basis != StaffMember.PayBasis.DAILY:
            attrs['output_quantity'] = 0
        return attrs


class StaffAttendanceSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.full_name', read_only=True)
    employee_number = serializers.CharField(source='worker.employee_number', read_only=True)

    class Meta:
        model = StaffAttendance
        fields = ['id', 'worker', 'worker_name', 'employee_number', 'date', 'attended', 'output_quantity', 'daily_wage', 'created_at', 'updated_at']
        read_only_fields = ['id', 'worker_name', 'employee_number', 'created_at', 'updated_at']


class PayrollRunSerializer(serializers.ModelSerializer):
    lines = PayrollLineSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = PayrollRun
        fields = [
            'id', 'period', 'status', 'status_display', 'worker_count', 'gross_total',
            'withholding_total', 'benefits_total', 'net_total', 'created_at', 'paid_at', 'lines',
        ]
        read_only_fields = fields

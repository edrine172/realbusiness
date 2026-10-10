from decimal import Decimal
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Category, Product, StockMovement, Supplier


class Command(BaseCommand):
    help = 'Create sample StockMaster categories, suppliers, products, and movements.'

    def handle(self, *args, **options):
        categories = {}
        for name in ['Electronics', 'Networking', 'Packaging', 'Warehouse Hardware']:
            categories[name], _ = Category.objects.get_or_create(name=name)

        suppliers = {}
        for name, lead in [
            ('OmniSilicon Global', 3),
            ('VoltCraft Energy Corp', 5),
            ('Photonix Interconnect', 2),
            ('PackMat Supply Logistics', 1),
        ]:
            suppliers[name], _ = Supplier.objects.get_or_create(name=name, defaults={'lead_time_days': lead})

        records = [
            ('99201-ESP', 'Micro-Controller ESP32 Dual Core', 'Electronics', 'OmniSilicon Global', 0, 150, '18.50', '11.00', 'Bin A-14 • Rack 03'),
            ('44102-LIP', 'Li-Po 3.7V 2500mAh Industrial Pack', 'Electronics', 'VoltCraft Energy Corp', 4, 50, '12.80', '8.40', 'Bin B-02 • Cold Storage'),
            ('77281-SFP', 'Optic Fiber Transceiver 10Gps', 'Networking', 'Photonix Interconnect', 12, 50, '86.40', '58.00', 'Bin C-09 • Rack 12'),
            ('10029-BX4', 'Anti-Static Corrugated Cartons #4', 'Packaging', 'PackMat Supply Logistics', 80, 400, '2.40', '1.10', 'Warehouse Floor • Bay 01'),
            ('22040-SEN', 'Industrial Proximity Sensor', 'Electronics', 'OmniSilicon Global', 230, 60, '42.00', '26.00', 'Bin A-05 • Rack 02'),
            ('18022-DRV', 'Variable Speed Drive 2.2kW', 'Warehouse Hardware', 'VoltCraft Energy Corp', 47, 20, '189.00', '124.00', 'Bay D-03'),
        ]
        for sku, name, category, supplier, quantity, reorder_level, price, cost, location in records:
            Product.objects.update_or_create(
                sku=sku,
                defaults={
                    'name': name,
                    'category': categories[category],
                    'supplier': suppliers[supplier],
                    'quantity': quantity,
                    'reorder_level': reorder_level,
                    'unit_price': Decimal(price),
                    'cost_price': Decimal(cost),
                    'location': location,
                },
            )

        history = [
            ('POS-4029', '22040-SEN', 'outbound', 12, 'POS Direct Checkout · Walk-in retail customer', 0),
            ('PO-1088', '10029-BX4', 'inbound', 120, 'Supplier inbound delivery · Receiving dock B', 0),
            ('ADJ-044', '77281-SFP', 'adjustment', -2, 'Damaged goods write-off · Warehouse section A', 0),
            ('INV-4028', '18022-DRV', 'outbound', 4, 'Wholesale client dispatch · Net 30 terms', 1),
            ('PO-1073', '99201-ESP', 'inbound', 40, 'Supplier delivery · Main warehouse', 2),
            ('POS-3991', '44102-LIP', 'outbound', 3, 'Point of sale · Terminal 02', 3),
            ('PO-1059', '77281-SFP', 'inbound', 16, 'Supplier restock · Verified clean', 5),
            ('POS-3910', '22040-SEN', 'outbound', 8, 'Customer dispatch · Online order', 9),
            ('PO-1022', '10029-BX4', 'inbound', 200, 'Packaging replenishment', 14),
            ('INV-3817', '18022-DRV', 'outbound', 2, 'Wholesale client dispatch', 22),
        ]
        for reference, sku, movement_type, quantity, note, days_ago in history:
            movement, _ = StockMovement.objects.update_or_create(
                reference=reference,
                defaults={
                    'product': Product.objects.get(sku=sku),
                    'movement_type': movement_type,
                    'quantity': quantity,
                    'note': note,
                    'created_at': timezone.now() - timedelta(days=days_ago, hours=2),
                },
            )
            StockMovement.objects.filter(pk=movement.pk).update(created_at=timezone.now() - timedelta(days=days_ago, hours=2))
        self.stdout.write(self.style.SUCCESS(f'Demo inventory ready: {Product.objects.count()} products.'))

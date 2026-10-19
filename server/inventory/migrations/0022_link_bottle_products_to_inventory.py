from django.db import migrations, models
import django.db.models.deletion


def link_bottle_products(apps, schema_editor):
    BottleProduct = apps.get_model('inventory', 'BottleProduct')
    Category = apps.get_model('inventory', 'Category')
    Product = apps.get_model('inventory', 'Product')

    for bottle_product in BottleProduct.objects.all().iterator():
        product = Product.objects.filter(sku=bottle_product.sku).first()
        if product is None:
            category_name = bottle_product.category[:100] or 'Uncategorized'
            category, _ = Category.objects.get_or_create(name=category_name)
            product = Product.objects.create(
                sku=bottle_product.sku,
                name=bottle_product.name,
                category=category,
                quantity=bottle_product.quantity,
                unit_price=bottle_product.unit_price,
                cost_price=0,
            )
        bottle_product.inventory_product_id = product.pk
        bottle_product.save(update_fields=['inventory_product'])


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('inventory', '0021_generalize_po_client_products'),
    ]

    operations = [
        migrations.AddField(
            model_name='bottleproduct',
            name='inventory_product',
            field=models.OneToOneField(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='bottle_catalog_entry',
                to='inventory.product',
            ),
        ),
        migrations.RunPython(link_bottle_products, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='bottleproduct',
            name='inventory_product',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='bottle_catalog_entry',
                to='inventory.product',
            ),
        ),
    ]

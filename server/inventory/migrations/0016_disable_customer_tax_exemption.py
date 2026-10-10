from django.db import migrations


def disable_existing_tax_exemptions(apps, schema_editor):
    Customer = apps.get_model('inventory', 'Customer')
    Customer.objects.filter(tax_exempt=True).update(tax_exempt=False)


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0015_staffattendance_output_quantity'),
    ]

    operations = [
        migrations.RunPython(disable_existing_tax_exemptions, migrations.RunPython.noop),
    ]

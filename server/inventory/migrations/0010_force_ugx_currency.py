from django.db import migrations


def force_ugandan_shillings(apps, schema_editor):
    SystemSetting = apps.get_model('inventory', 'SystemSetting')
    SystemSetting.objects.filter(key='currency').update(category='organization', value='UGX')


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0009_systemsetting'),
    ]

    operations = [
        migrations.RunPython(force_ugandan_shillings, migrations.RunPython.noop),
    ]
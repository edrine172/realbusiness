from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0014_staffattendance_daily_payroll'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffattendance',
            name='output_quantity',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
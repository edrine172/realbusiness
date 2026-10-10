from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0011_staffmember_payrollrun_payrollline_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_key', models.CharField(max_length=140, unique=True)),
                ('category', models.CharField(choices=[('stock', 'Stock alerts'), ('procurement', 'Procurement'), ('billing', 'Billing and sales'), ('operations', 'Operations')], max_length=16)),
                ('severity', models.CharField(choices=[('info', 'Information'), ('warning', 'Warning'), ('critical', 'Critical')], default='info', max_length=12)),
                ('title', models.CharField(max_length=160)),
                ('message', models.TextField()),
                ('target_label', models.CharField(blank=True, max_length=120)),
                ('dashboard', models.CharField(max_length=24)),
                ('is_read', models.BooleanField(default=False)),
                ('is_dismissed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
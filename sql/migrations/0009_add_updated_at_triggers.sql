-- programs 테이블 updated_at 트리거
CREATE TRIGGER set_programs_updated_at
BEFORE UPDATE ON public.programs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- instructors 테이블 updated_at 트리거
CREATE TRIGGER set_instructors_updated_at
BEFORE UPDATE ON public.instructors
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- schedules 테이블 updated_at 트리거
CREATE TRIGGER set_schedules_updated_at
BEFORE UPDATE ON public.schedules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- organizations 테이블 updated_at 트리거
CREATE TRIGGER set_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- organization_members 테이블 updated_at 트리거
CREATE TRIGGER set_organization_members_updated_at
BEFORE UPDATE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- settings 테이블 updated_at 트리거
CREATE TRIGGER set_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
